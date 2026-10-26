package com.jd.posting.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.service.CompanyService;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.JobPostingTerm;
import com.jd.posting.model.JobPostingTermProfile;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.model.PostingKnowledgeDtos;
import com.jd.posting.model.PostingKnowledgeEnums;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.repo.JobPostingTermProfileRepository;
import com.jd.posting.repo.JobPostingTermRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

@RequiredArgsConstructor
public class PostingKnowledgeService {

    private static final Map<String, String> TERM_ALIASES = Map.ofEntries(
            Map.entry("springboot", "Spring Boot"),
            Map.entry("springcloud", "Spring Cloud"),
            Map.entry("nodejs", "Node.js"),
            Map.entry("reactjs", "React"),
            Map.entry("react", "React"),
            Map.entry("vuejs", "Vue"),
            Map.entry("vue", "Vue"),
            Map.entry("typescript", "TypeScript"),
            Map.entry("javascript", "JavaScript"),
            Map.entry("golang", "Go"),
            Map.entry("go", "Go"),
            Map.entry("postgres", "PostgreSQL"),
            Map.entry("postgresql", "PostgreSQL"),
            Map.entry("k8s", "Kubernetes"),
            Map.entry("kubernetes", "Kubernetes"),
            Map.entry("restfulapi", "RESTful API"),
            Map.entry("llm", "LLM"),
            Map.entry("大语言模型", "LLM"),
            Map.entry("rag", "RAG"),
            Map.entry("agent", "Agent"),
            Map.entry("智能体", "Agent")
    );

    private static final Comparator<JobPostingTerm> TERM_ORDER = Comparator
            .comparingInt((JobPostingTerm term) -> term.getPriority().weight()).reversed()
            .thenComparing(JobPostingTerm::getTerm, String.CASE_INSENSITIVE_ORDER);

    private final JobPostingRepository postingRepository;
    private final JobPostingTermProfileRepository profileRepository;
    private final JobPostingTermRepository termRepository;
    private final CompanyService companyService;

    @Transactional(readOnly = true)
    public List<PostingKnowledgeDtos.PostingOption> options(
            String keyword,
            Collection<String> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages
    ) {
        List<JobPosting> postings = postingRepository.findAllByDeletedFalseOrderByUpdatedAtDesc();
        Map<Long, JobPostingTermProfile> profiles = profiles(postings.stream().map(JobPosting::getId).toList());
        Map<Long, Integer> counts = termCounts(profiles.values());
        String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        return postings.stream().filter(posting -> includes(directions, posting.getDirection()))
                .filter(posting -> includes(tiers, posting.getTier()))
                .filter(posting -> includes(stages, posting.getStage()))
                .map(posting -> {
                    String companyName = companyService.getEntity(posting.getCompanyId()).getName();
                    JobPostingTermProfile profile = profiles.get(posting.getId());
                    return new OptionWithSearch(new PostingKnowledgeDtos.PostingOption(
                            posting.getId(), companyName, posting.getTitle(), posting.getDirection(), posting.getTier(),
                            posting.getStage(), profile != null, profile == null ? 0 : counts.getOrDefault(profile.getId(), 0),
                            profile != null && stale(posting, profile)
                    ), (companyName + " " + posting.getTitle()).toLowerCase(Locale.ROOT));
                })
                .filter(row -> normalizedKeyword.isEmpty() || row.searchText().contains(normalizedKeyword))
                .map(OptionWithSearch::option)
                .toList();
    }

    @Transactional(readOnly = true)
    public PostingKnowledgeDtos.PostingTerms getTerms(Long postingId) {
        JobPosting posting = getPosting(postingId);
        JobPostingTermProfile profile = profileRepository.findByPostingIdAndDeletedFalse(postingId).orElse(null);
        if (profile == null) {
            return new PostingKnowledgeDtos.PostingTerms(postingId, false, null, null, false, null, List.of());
        }
        return toPostingTerms(posting, profile, termRepository.findAllByProfileIdAndDeletedFalse(profile.getId()));
    }

    @Transactional
    public PostingKnowledgeDtos.PostingTerms replaceTerms(
            Long postingId,
            PostingKnowledgeDtos.ReplaceTermsRequest request
    ) {
        JobPosting posting = getPosting(postingId);
        LinkedHashMap<String, NormalizedTerm> normalized = new LinkedHashMap<>();
        for (PostingKnowledgeDtos.TermInput input : request.terms()) {
            NormalizedTerm candidate = normalize(input);
            NormalizedTerm current = normalized.get(candidate.normalized());
            if (current == null || candidate.priority().weight() > current.priority().weight()) {
                normalized.put(candidate.normalized(), candidate);
            }
        }
        if (normalized.size() > 30) {
            throw validation("每条JD最多保存30个不同知识词");
        }
        JobPostingTermProfile profile = profileRepository.findByPostingIdAndDeletedFalse(postingId)
                .orElseGet(JobPostingTermProfile::new);
        profile.setPostingId(postingId);
        profile.setExtractorVersion(request.extractorVersion().trim());
        profile.setSourceHash(sourceHash(posting));
        profile.setGeneratedAt(LocalDateTime.now());
        profile.setDeleted(false);
        profile = profileRepository.saveAndFlush(profile);

        termRepository.deleteAllByProfileId(profile.getId());
        List<JobPostingTerm> terms = new ArrayList<>();
        for (NormalizedTerm item : normalized.values()) {
            JobPostingTerm term = new JobPostingTerm();
            term.setProfileId(profile.getId());
            term.setTerm(item.display());
            term.setNormalizedTerm(item.normalized());
            term.setPriority(item.priority());
            terms.add(term);
        }
        if (!terms.isEmpty()) termRepository.saveAll(terms);
        return toPostingTerms(posting, profile, terms);
    }

    @Transactional(readOnly = true)
    public PostingKnowledgeDtos.KnowledgeGraph graph(PostingKnowledgeDtos.GraphRequest request) {
        int minDocuments = request.minDocumentCount() == null ? 2 : request.minDocumentCount();
        int minEdgeDocuments = request.minEdgeDocumentCount() == null ? 2 : request.minEdgeDocumentCount();
        int maxNodes = request.maxNodes() == null ? 80 : request.maxNodes();
        List<JobPosting> postings = selectedPostings(request.postingIds());
        List<Long> postingIds = postings.stream().map(JobPosting::getId).toList();
        Map<Long, JobPostingTermProfile> profiles = profiles(postingIds);
        Map<Long, List<JobPostingTerm>> termsByProfile = termsByProfile(profiles.values());

        List<Long> unprocessed = new ArrayList<>();
        List<Long> empty = new ArrayList<>();
        List<Long> stale = new ArrayList<>();
        Map<String, NodeAccumulator> nodes = new HashMap<>();
        Map<PairKey, EdgeAccumulator> edges = new HashMap<>();
        int tagged = 0;

        for (JobPosting posting : postings) {
            JobPostingTermProfile profile = profiles.get(posting.getId());
            if (profile == null) {
                unprocessed.add(posting.getId());
                continue;
            }
            if (stale(posting, profile)) {
                stale.add(posting.getId());
                continue;
            }
            List<JobPostingTerm> terms = termsByProfile.getOrDefault(profile.getId(), List.of()).stream()
                    .sorted(Comparator.comparing(JobPostingTerm::getNormalizedTerm)).toList();
            if (terms.isEmpty()) {
                empty.add(posting.getId());
                continue;
            }
            tagged++;
            for (JobPostingTerm term : terms) {
                nodes.computeIfAbsent(term.getNormalizedTerm(), key -> new NodeAccumulator(term.getTerm()))
                        .add(posting.getId(), term);
            }
            for (int left = 0; left < terms.size(); left++) {
                for (int right = left + 1; right < terms.size(); right++) {
                    JobPostingTerm first = terms.get(left);
                    JobPostingTerm second = terms.get(right);
                    PairKey key = new PairKey(first.getNormalizedTerm(), second.getNormalizedTerm());
                    edges.computeIfAbsent(key, ignored -> new EdgeAccumulator())
                            .add(posting.getId(), Math.min(first.getPriority().weight(), second.getPriority().weight()));
                }
            }
        }

        List<PostingKnowledgeDtos.GraphNode> graphNodes = nodes.entrySet().stream()
                .filter(entry -> entry.getValue().postingIds.size() >= minDocuments)
                .map(entry -> entry.getValue().response(entry.getKey()))
                .sorted(Comparator.comparingInt(PostingKnowledgeDtos.GraphNode::weightedCount).reversed()
                        .thenComparing(PostingKnowledgeDtos.GraphNode::label, String.CASE_INSENSITIVE_ORDER))
                .limit(maxNodes)
                .toList();
        Set<String> retained = graphNodes.stream().map(PostingKnowledgeDtos.GraphNode::id).collect(java.util.stream.Collectors.toSet());
        List<PostingKnowledgeDtos.GraphEdge> graphEdges = edges.entrySet().stream()
                .filter(entry -> retained.contains(entry.getKey().source()) && retained.contains(entry.getKey().target()))
                .filter(entry -> entry.getValue().postingIds.size() >= minEdgeDocuments)
                .map(entry -> entry.getValue().response(entry.getKey()))
                .sorted(Comparator.comparingInt(PostingKnowledgeDtos.GraphEdge::weightedCount).reversed()
                        .thenComparing(PostingKnowledgeDtos.GraphEdge::source)
                        .thenComparing(PostingKnowledgeDtos.GraphEdge::target))
                .toList();
        return new PostingKnowledgeDtos.KnowledgeGraph(postings.size(), profiles.size(), tagged, stale.size(),
                sorted(unprocessed), sorted(empty), sorted(stale), graphNodes, graphEdges);
    }

    private PostingKnowledgeDtos.PostingTerms toPostingTerms(
            JobPosting posting,
            JobPostingTermProfile profile,
            Collection<JobPostingTerm> terms
    ) {
        List<PostingKnowledgeDtos.TermResponse> responses = terms.stream().sorted(TERM_ORDER)
                .map(term -> new PostingKnowledgeDtos.TermResponse(term.getTerm(), term.getNormalizedTerm(),
                        term.getPriority(), term.getPriority().weight()))
                .toList();
        return new PostingKnowledgeDtos.PostingTerms(posting.getId(), true, profile.getExtractorVersion(),
                profile.getSourceHash(), stale(posting, profile), profile.getUpdatedAt(), responses);
    }

    private List<JobPosting> selectedPostings(List<Long> requestedIds) {
        if (requestedIds == null) return postingRepository.findAllByDeletedFalseOrderByUpdatedAtDesc();
        Set<Long> ids = new LinkedHashSet<>(requestedIds);
        if (ids.isEmpty()) return List.of();
        Map<Long, JobPosting> found = new HashMap<>();
        postingRepository.findAllById(ids).stream().filter(posting -> !Boolean.TRUE.equals(posting.getDeleted()))
                .forEach(posting -> found.put(posting.getId(), posting));
        if (found.size() != ids.size()) throw notFound("选择中包含不存在或已删除的岗位");
        return ids.stream().map(found::get).toList();
    }

    private Map<Long, JobPostingTermProfile> profiles(Collection<Long> postingIds) {
        if (postingIds.isEmpty()) return Map.of();
        Map<Long, JobPostingTermProfile> result = new HashMap<>();
        profileRepository.findAllByPostingIdInAndDeletedFalse(postingIds)
                .forEach(profile -> result.put(profile.getPostingId(), profile));
        return result;
    }

    private Map<Long, List<JobPostingTerm>> termsByProfile(Collection<JobPostingTermProfile> profiles) {
        if (profiles.isEmpty()) return Map.of();
        List<Long> ids = profiles.stream().map(JobPostingTermProfile::getId).toList();
        Map<Long, List<JobPostingTerm>> result = new HashMap<>();
        termRepository.findAllByProfileIdInAndDeletedFalse(ids)
                .forEach(term -> result.computeIfAbsent(term.getProfileId(), ignored -> new ArrayList<>()).add(term));
        return result;
    }

    private Map<Long, Integer> termCounts(Collection<JobPostingTermProfile> profiles) {
        Map<Long, Integer> result = new HashMap<>();
        termsByProfile(profiles).forEach((profileId, terms) -> result.put(profileId, terms.size()));
        return result;
    }

    private NormalizedTerm normalize(PostingKnowledgeDtos.TermInput input) {
        String text = Normalizer.normalize(input.term(), Normalizer.Form.NFKC).trim().replaceAll("\\s+", " ");
        String key = aliasKey(text);
        if (key.isBlank()) throw validation("知识词标准化后不能为空");
        String display = TERM_ALIASES.getOrDefault(key, text);
        return new NormalizedTerm(display, aliasKey(display), input.priority());
    }

    private String aliasKey(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[\\s._/\\\\-]+", "");
    }

    private boolean stale(JobPosting posting, JobPostingTermProfile profile) {
        return !sourceHash(posting).equals(profile.getSourceHash());
    }

    private String sourceHash(JobPosting posting) {
        String source = String.join("\u001f", safe(posting.getTitle()), posting.getDirection(),
                safe(posting.getRawJd()), safe(posting.getRequiredSkills()), safe(posting.getBonusSkills()));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private JobPosting getPosting(Long id) {
        return postingRepository.findByIdAndDeletedFalse(id).orElseThrow(() -> notFound("岗位不存在"));
    }

    private <T> boolean includes(Collection<T> values, T actual) {
        return values == null || values.isEmpty() || values.contains(actual);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private List<Long> sorted(Collection<Long> ids) {
        return ids.stream().sorted().toList();
    }

    private BusinessException validation(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message);
    }

    private BusinessException notFound(String message) {
        return new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, message);
    }

    private record OptionWithSearch(PostingKnowledgeDtos.PostingOption option, String searchText) {
    }

    private record NormalizedTerm(
            String display,
            String normalized,
            PostingKnowledgeEnums.Priority priority
    ) {
    }

    private record PairKey(String source, String target) {
    }

    private static final class NodeAccumulator {
        private String label;
        private int weightedCount;
        private int highCount;
        private int mediumCount;
        private int lowCount;
        private final Set<Long> postingIds = new TreeSet<>();

        private NodeAccumulator(String label) {
            this.label = label;
        }

        private void add(Long postingId, JobPostingTerm term) {
            postingIds.add(postingId);
            weightedCount += term.getPriority().weight();
            if (term.getTerm().compareToIgnoreCase(label) < 0) label = term.getTerm();
            switch (term.getPriority()) {
                case HIGH -> highCount++;
                case MEDIUM -> mediumCount++;
                case LOW -> lowCount++;
            }
        }

        private PostingKnowledgeDtos.GraphNode response(String id) {
            return new PostingKnowledgeDtos.GraphNode(id, label, postingIds.size(), weightedCount,
                    highCount, mediumCount, lowCount, List.copyOf(postingIds));
        }
    }

    private static final class EdgeAccumulator {
        private int weightedCount;
        private final Set<Long> postingIds = new TreeSet<>();

        private void add(Long postingId, int weight) {
            postingIds.add(postingId);
            weightedCount += weight;
        }

        private PostingKnowledgeDtos.GraphEdge response(PairKey key) {
            return new PostingKnowledgeDtos.GraphEdge(key.source(), key.target(), postingIds.size(),
                    weightedCount, List.copyOf(postingIds));
        }
    }
}
