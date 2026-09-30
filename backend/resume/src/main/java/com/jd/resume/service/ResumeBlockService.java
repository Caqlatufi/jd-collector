package com.jd.resume.service;

import com.jd.resume.model.ResumeContentBlock;
import com.jd.resume.model.ResumeDtos;
import com.jd.resume.repo.ResumeContentBlockRepository;
import lombok.RequiredArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RequiredArgsConstructor
public class ResumeBlockService {

    private static final int TARGET_CHUNK_SIZE = 1200;
    private static final Pattern HEADING = Pattern.compile("^(#{2,4})\\s+(.+?)\\s*$");
    private final ResumeContentBlockRepository repository;

    public void replace(Long resumeVersionId, String markdown) {
        repository.deleteAllByResumeVersionId(resumeVersionId);
        repository.flush();
        repository.saveAll(parse(resumeVersionId, markdown));
    }

    public long count(Long resumeVersionId) {
        return repository.countByResumeVersionIdAndDeletedFalse(resumeVersionId);
    }

    public List<ResumeDtos.BlockResponse> list(Long resumeVersionId) {
        return repository.findAllByResumeVersionIdAndDeletedFalseOrderBySortOrderAsc(resumeVersionId).stream()
                .map(item -> new ResumeDtos.BlockResponse(
                        item.getId(), item.getSectionKey(), item.getHeading(), item.getHeadingLevel(),
                        item.getChunkIndex(), item.getSortOrder(), item.getContentMarkdown(),
                        item.getContentPlainText(), item.getCharacterCount(), item.getContentHash()))
                .toList();
    }

    private List<ResumeContentBlock> parse(Long resumeVersionId, String source) {
        String markdown = source.replace("\r\n", "\n").replace('\r', '\n').trim();
        List<ResumeContentBlock> blocks = new ArrayList<>();
        String heading = null;
        int headingLevel = 0;
        int sectionNumber = 0;
        int chunkIndex = 0;
        String sectionKey = "profile";
        StringBuilder buffer = new StringBuilder();

        for (String line : markdown.split("\n", -1)) {
            Matcher matcher = HEADING.matcher(line);
            if (matcher.matches()) {
                chunkIndex = flush(blocks, resumeVersionId, sectionKey, heading, headingLevel, chunkIndex, buffer);
                headingLevel = matcher.group(1).length();
                heading = matcher.group(2).trim();
                sectionKey = "section-" + (++sectionNumber);
                chunkIndex = 0;
                buffer.append(line).append('\n');
                continue;
            }
            buffer.append(line).append('\n');
            if (line.isBlank() && buffer.length() >= TARGET_CHUNK_SIZE) {
                chunkIndex = flush(blocks, resumeVersionId, sectionKey, heading, headingLevel, chunkIndex, buffer);
            }
        }
        flush(blocks, resumeVersionId, sectionKey, heading, headingLevel, chunkIndex, buffer);
        return blocks;
    }

    private int flush(List<ResumeContentBlock> blocks, Long resumeVersionId, String sectionKey,
                      String heading, int headingLevel, int chunkIndex, StringBuilder buffer) {
        String chunk = buffer.toString().trim();
        buffer.setLength(0);
        if (chunk.isBlank()) {
            return chunkIndex;
        }
        String plainText = toPlainText(chunk);
        ResumeContentBlock block = new ResumeContentBlock();
        block.setResumeVersionId(resumeVersionId);
        block.setSectionKey(sectionKey);
        block.setHeading(heading);
        block.setHeadingLevel(headingLevel);
        block.setChunkIndex(chunkIndex);
        block.setSortOrder(blocks.size());
        block.setContentMarkdown(chunk);
        block.setContentPlainText(plainText);
        block.setCharacterCount(plainText.length());
        block.setContentHash(sha256(chunk));
        blocks.add(block);
        return chunkIndex + 1;
    }

    private String toPlainText(String markdown) {
        return markdown
                .replaceAll("(?m)^#{1,6}\\s+", "")
                .replaceAll("(?m)^\\s*[-*+]\\s+", "")
                .replaceAll("(?m)^\\s*>\\s?", "")
                .replaceAll("!\\[([^]]*)]\\([^)]*\\)", "$1")
                .replaceAll("\\[([^]]+)]\\([^)]*\\)", "$1")
                .replaceAll("[*_`~]", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
