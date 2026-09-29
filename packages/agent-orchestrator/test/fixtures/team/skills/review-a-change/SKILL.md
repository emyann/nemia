---
name: review-a-change
title: "Review a change"
description: "Reads a change against its base as a second engineer would, and says what is worth changing."
tags: ["code", "review"]
examples: ["Use this when a change is written and nobody has read it yet."]
---
Read the diff against the base. For each finding, name the file, the line and what would go wrong. Say `again: true` only when a
finding is worth another round.
