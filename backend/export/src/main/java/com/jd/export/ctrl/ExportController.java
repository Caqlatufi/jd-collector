package com.jd.export.ctrl;

import com.jd.posting.model.PostingDtos;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.service.PostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/postings")
@RequiredArgsConstructor
public class ExportController {

    private final PostingService postingService;

    @GetMapping(value = "/export.csv", produces = "text/csv")
    public ResponseEntity<byte[]> export(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(required = false) List<String> direction,
            @RequestParam(required = false) List<PostingEnums.Tier> tier,
            @RequestParam(required = false) List<PostingEnums.Stage> stage,
            @RequestParam(required = false) Long companyId,
            @RequestParam(defaultValue = "SCORE") PostingEnums.SortBy sortBy
    ) {
        List<PostingDtos.Response> rows = postingService.exportRows(keyword, direction, tier, stage, companyId, sortBy);
        StringBuilder csv = new StringBuilder("\uFEFF");
        csv.append("公司,岗位,方向,来源,链接,地点,薪资下限K,薪资上限K,薪资月数,总分,等级,风险,建议动作,阶段,简历版本,投递时间,下一步,下一步时间,更新时间\r\n");
        for (PostingDtos.Response row : rows) {
            append(csv,
                    row.companyName(), row.title(), row.direction(), row.source(), row.sourceUrl(), row.location(),
                    row.salaryMinK(), row.salaryMaxK(), row.salaryMonths(), row.totalScore(), row.tier(),
                    row.riskNotes(), row.recommendation(), row.stage(), row.resumeVersionName(), row.appliedAt(),
                    row.nextAction(), row.nextActionAt(), row.updatedAt());
        }
        String filename = "jd-collector-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")) + ".csv";
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void append(StringBuilder csv, Object... values) {
        for (int index = 0; index < values.length; index++) {
            if (index > 0) {
                csv.append(',');
            }
            String value = values[index] == null ? "" : values[index].toString();
            csv.append('"').append(value.replace("\"", "\"\"")).append('"');
        }
        csv.append("\r\n");
    }
}
