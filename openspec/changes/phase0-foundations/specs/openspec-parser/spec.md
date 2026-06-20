## ADDED Requirements

### Requirement: Parse canonical OpenSpec Markdown into a stable in-memory model
The parser SHALL consume `openspec/specs/<domain>/spec.md`, `openspec/changes/<change>/{proposal,design,tasks}.md`, delta specs, and `openspec/changes/<change>/specs/<domain>/spec.md` and return structured specs, requirements, scenarios, changes, artifacts, delta specs, and tasks. It SHALL be re-implemented from documented upstream rules, not from bundled/unavailable source (NFR-5).

#### Scenario: Parse a valid spec tree
- **WHEN** the parser runs against a project with `openspec/specs/<domain>/spec.md` and `openspec/changes/<change>/`
- **THEN** it returns structured specs, requirements, scenarios, changes, artifacts, delta specs, and tasks without throwing

#### Scenario: Malformed Markdown does not crash the parser
- **WHEN** the parser runs against a `spec.md` with a `### Requirement:` heading followed by no body and a malformed scenario block
- **THEN** it returns the parts it could parse plus a structured parse-error listing the file and line, and does not throw

### Requirement: Delta grammar (ADDED / MODIFIED / REMOVED / RENAMED)
The parser SHALL parse delta spec files containing `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` (with `**Reason**` + `**Migration**`), and `## RENAMED Requirements` (`FROM:`/`TO:`) into a typed delta model.

#### Scenario: All four delta verbs parse
- **WHEN** a delta spec contains one ADDED, one MODIFIED, one REMOVED, and one RENAMED block
- **THEN** the parser returns a delta model with four entries each carrying its verb-specific fields

#### Scenario: REMOVED block missing required Reason/Migration
- **WHEN** a `## REMOVED Requirements` block omits the `**Migration**` field
- **THEN** the parser flags a structured validation error naming the offending requirement instead of silently accepting an incomplete removal

### Requirement: tasks.md checkbox parser
The parser SHALL parse `tasks.md` into grouped checkbox task lines (`- [ ]` / `- [x]`) preserving group headings, the verbatim checkbox marker, and the verbatim label bytes — markers are preserved as-written, not normalized (INV-2).

#### Scenario: Preserve verbatim markers
- **WHEN** a `tasks.md` uses a mix of `- [ ]`, `- [x]`, and `- [X]` markers
- **THEN** the parsed model retains the exact marker bytes per task and re-serialization reproduces them unchanged

#### Scenario: Unchecked vs checked is distinguishable
- **WHEN** the parser reads a task line `- [x] 1.1 Do thing`
- **THEN** the model records `checked: true` and the display number `1.1` as display-only metadata, not as an identity field

### Requirement: Round-trip byte fidelity on untouched regions (NFR-4)
The parser + serializer SHALL reproduce the input bytes exactly for any region that was not explicitly edited, across a fixture corpus. Re-parsing the serialized output SHALL produce a structurally equal model.

#### Scenario: Edit one task line, serialize, re-parse
- **WHEN** a `tasks.md` is parsed, one task line is mutated in the model, and the result is serialized and re-parsed
- **THEN** every non-edited line is byte-identical to the input and the re-parsed model equals the mutated model

#### Scenario: Property-based corpus round-trip
- **WHEN** a property test feeds the parser a generated corpus of spec/change/tasks fixtures
- **THEN** parse→serialize→parse yields a model equal to the first parse for 100% of the corpus

### Requirement: Documented-rule enumeration and gap registry (NFR-5)
The parser SHALL ship an enumerated list of the documented upstream rules it implements and a gap registry of upstream constructs it cannot confirm from documentation. Encountering an unregistered construct during parse SHALL append it to the gap registry and continue.

#### Scenario: Known rule parsed
- **WHEN** the parser encounters a `#### Scenario:` with `- **WHEN**`/`- **THEN**`
- **THEN** it parses it under a documented rule listed in the rule enumeration

#### Scenario: Unknown construct recorded, not crashed
- **WHEN** the parser encounters a front-matter key or block shape not in the documented-rule list
- **THEN** it records the construct in the gap registry (file, line, construct description) and continues parsing the rest of the tree
