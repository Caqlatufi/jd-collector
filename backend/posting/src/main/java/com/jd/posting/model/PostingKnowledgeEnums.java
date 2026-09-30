package com.jd.posting.model;

public final class PostingKnowledgeEnums {

    private PostingKnowledgeEnums() {
    }

    public enum Priority {
        HIGH(3),
        MEDIUM(2),
        LOW(1);

        private final int weight;

        Priority(int weight) {
            this.weight = weight;
        }

        public int weight() {
            return weight;
        }
    }
}
