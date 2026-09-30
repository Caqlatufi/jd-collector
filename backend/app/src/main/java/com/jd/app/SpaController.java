package com.jd.app;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/postings",
            "/postings/knowledge-graph",
            "/pipeline",
            "/interviews",
            "/resumes",
            "/resumes/{id}/edit",
            "/resumes/{id}/view",
            "/companies",
            "/accounts",
            "/criteria"
    })
    public String index() {
        return "forward:/index.html";
    }
}
