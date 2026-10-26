<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import {computed} from 'vue';

const props = defineProps<{markdown: string; photoUrl?: string; compact?: boolean}>();
const parser = new MarkdownIt({html: false, linkify: true, typographer: false, breaks: false});
const rendered = computed(() => parser.render(props.markdown || ''));
const resolvedPhotoUrl = computed(() => {
  const url = props.photoUrl?.trim();
  if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
});
</script>

<template>
  <article :class="['resume-paper', {compact}]">
    <img v-if="resolvedPhotoUrl" class="resume-photo" :src="resolvedPhotoUrl" alt="简历照片" />
    <div class="resume-markdown" v-html="rendered" />
  </article>
</template>

<style lang="scss">
.resume-paper {
  --resume-ink: #172033;
  --resume-muted: #536174;
  --resume-primary: #174a7c;
  --resume-accent: #1f6fb2;
  --resume-line: #d8e2ee;
  --resume-soft: #edf5fc;
  position: relative;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 9mm 10mm 9mm;
  color: var(--resume-ink);
  background: #fff;
  box-shadow: 0 12px 34px rgba(24, 45, 72, .14);
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.36;
  overflow-wrap: anywhere;
}

.resume-photo {
  position: absolute;
  top: 9mm;
  right: 10mm;
  width: 26mm;
  height: 33mm;
  border: 1px solid var(--resume-line);
  object-fit: cover;
  object-position: 50% 28%;
}

.resume-markdown {
  > h1 {
    width: calc(100% - 38mm);
    margin: 0;
    color: var(--resume-primary);
    font-size: 25pt;
    line-height: 1.05;
    font-weight: 800;
  }

  > blockquote {
    width: calc(100% - 38mm);
    margin: 2mm 0 0;
    padding: 0 0 4mm;
    border: 0;
    border-bottom: 2px solid var(--resume-primary);
    color: #1d3e66;
    font-size: 11pt;
    font-weight: 700;

    p { margin: 0; }
  }

  > blockquote + ul {
    width: calc(100% - 38mm);
    min-height: 15.5mm;
    margin: 2mm 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1mm 5mm;
    color: #314259;
    font-size: 9.2pt;
    list-style: none;

    li { margin: 0; padding: 0; }
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 2.5mm;
    margin: 4mm 0 2mm;
    color: var(--resume-primary);
    font-size: 11.5pt;
    line-height: 1.2;
    font-weight: 800;
    break-after: avoid;

    &::before { content: ""; width: 3mm; height: 3mm; background: var(--resume-accent); }
  }

  h3 {
    margin: 3mm 0 1.5mm;
    padding: 1.2mm 2.2mm;
    border-left: 1mm solid var(--resume-accent);
    color: var(--resume-primary);
    background: var(--resume-soft);
    font-size: 9.8pt;
    break-after: avoid;
  }

  h4 {
    margin: 2mm 0 1mm;
    color: #263b55;
    font-size: 9.6pt;
    break-after: avoid;
  }

  p { margin: 0 0 1.2mm; orphans: 2; widows: 2; }
  ul { margin: 0; padding-left: 5mm; }
  li { margin: 0 0 .7mm; padding-left: .5mm; orphans: 2; widows: 2; }
  li::marker { color: var(--resume-accent); }
  strong { color: #213b5c; }
  a { color: var(--resume-accent); text-decoration: none; }
}

.resume-paper.compact { transform-origin: top center; }

@media (max-width: 900px) {
  .resume-paper { width: 100%; min-height: auto; padding: 24px 20px 32px; box-shadow: none; }
  .resume-photo { top: 24px; right: 20px; width: 74px; height: 94px; }
  .resume-markdown > h1,
  .resume-markdown > blockquote,
  .resume-markdown > blockquote + ul { width: calc(100% - 94px); }
}

@media print {
  @page { size: A4; margin: 0; }
  .resume-paper {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    box-shadow: none;
  }
  .resume-paper,
  .resume-paper * {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
