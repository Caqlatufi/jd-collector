"""Extract an offline, display-only Shanghai road layer from Geofabrik's OSM SHP archive."""
import argparse
import hashlib
import io
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

import shapefile
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "https://download.geofabrik.de/asia/china/shanghai-latest-free.shp.zip"
CLASSES = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "living_street", "service",
}


def lines(geometry):
    if geometry.geom_type == "LineString":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from lines(part)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "runtime/maps/shanghai-latest-free.shp.zip")
    parser.add_argument("--download", action="store_true", help="Refresh the source archive from Geofabrik")
    parser.add_argument("--output", type=Path, default=ROOT / "frontend/src/company/assets/shanghai-roads.geojson")
    args = parser.parse_args()
    if args.download:
        args.source.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.source.with_suffix(".download")
        with urlopen(SOURCE, timeout=60) as response, temporary.open("wb") as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
        temporary.replace(args.source)
    boundary = json.loads((ROOT / "frontend/src/company/assets/shanghai.json").read_text(encoding="utf-8"))
    area = unary_union([shape(feature["geometry"]) for feature in boundary["features"]]).buffer(0)
    features = []
    counts = Counter()
    with ZipFile(args.source) as archive:
        stem = next(name[:-4] for name in archive.namelist() if name.endswith("gis_osm_roads_free_1.shp"))
        reader = shapefile.Reader(**{ext: io.BytesIO(archive.read(stem + "." + ext)) for ext in ("shp", "shx", "dbf")}, encoding="utf-8")
        for row in reader.iterShapeRecords():
            record = row.record.as_dict()
            highway = record["fclass"]
            if highway not in CLASSES:
                continue
            geometry = shape(row.shape.__geo_interface__)
            if not area.intersects(geometry):
                continue
            for index, line in enumerate(lines(geometry.intersection(area))):
                # About one metre: retain street geometry without shipping redundant vertices.
                points = [[round(x, 6), round(y, 6)] for x, y in line.simplify(0.000008).coords]
                points = [point for i, point in enumerate(points) if not i or point != points[i - 1]]
                if len(points) < 2:
                    continue
                features.append({"type": "Feature", "id": f"{record['osm_id']}-{index}",
                                 "properties": {"name": record.get("name") or "", "ref": record.get("ref") or "", "highway": highway},
                                 "geometry": {"type": "LineString", "coordinates": points}})
                counts[highway] += 1
    features.sort(key=lambda feature: feature["id"])
    result = {"type": "FeatureCollection", "name": "Shanghai roads", "features": features}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    metadata = {"source": SOURCE, "sourcePage": "https://download.geofabrik.de/asia/china/shanghai.html",
                "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
                "archiveRoadsModified": list(archive.getinfo(stem + ".shp").date_time),
                "generatedAt": datetime.now(timezone.utc).isoformat(), "crs": "WGS84 / EPSG:4326",
                "license": "ODbL-1.0", "licenseUrl": "https://www.openstreetmap.org/copyright",
                "attribution": "© OpenStreetMap contributors / Geofabrik", "featureCount": len(features),
                "classes": dict(sorted(counts.items())), "simplifyToleranceDegrees": 0.000008,
                "note": "Clipped to bundled Shanghai district polygons; for map display, not a routing graph."}
    args.output.with_suffix(".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"features": len(features), "bytes": args.output.stat().st_size, "classes": dict(counts)}))


if __name__ == "__main__":
    main()
