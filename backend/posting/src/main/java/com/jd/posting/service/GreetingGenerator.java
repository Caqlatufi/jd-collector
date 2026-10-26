package com.jd.posting.service;

import com.jd.posting.model.GreetingDtos;

public interface GreetingGenerator {
    GreetingDtos.Draft generate(GreetingDtos.Input input);
}
