## ADDED Requirements

### Requirement: Parser SHALL accept a main spec file and return its requirements and scenarios
The `parseMainSpec(content, filePath)` function SHALL accept the full text of an `openspec/specs/<capability>/spec.md` file and return a `MainSpecModel` containing the capability name (derived from `filePath` or an explicit argument), the `## Requirements` section's requirement blocks, and any parse issues. A requirement block SHALL be a `### Requirement: <name>` header followed by its body text and nested `#### Scenario: <name>` blocks. Requirements appearing outside a `## Requirements` section SHALL be collected as a `requirement-outside-requirements` parse issue of severity `warn` and SHALL NOT appear in the model's requirements list.

#### Scenario: Well-formed main spec with two requirements
- **WHEN** `parseMainSpec` is called with content containing `## Requirements` followed by two `### Requirement:` blocks, each with one `#### Scenario:` block
- **THEN** the returned model's `requirements` array SHALL have length 2 and each requirement's `scenarios` array SHALL have length 1, with no parse issues

#### Scenario: Requirement header outside the Requirements section
- **WHEN** the content contains a `### Requirement: Foo` line before any `## Requirements` header
- **THEN** the returned model's `requirements` array SHALL be empty and the issues array SHALL contain one entry with `kind: "requirement-outside-requirements"`, the line number, and severity `warn`

#### Scenario: Fenced code block containing a requirement-looking line is ignored
- **WHEN** the content contains a triple-backtick fenced block whose body includes the text `### Requirement: Decoy`
- **THEN** the parser SHALL NOT emit a requirement or an issue for that line, because fenced code blocks are stripped (line-preserving) before header detection

### Requirement: Parser SHALL flag delta headers in a main spec as an error
A `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, or `## RENAMED Requirements` header appearing in a file passed to `parseMainSpec` SHALL be collected as a `delta-header` parse issue of severity `error`, because delta headers are only valid inside change delta specs and would silently truncate the parsed `## Requirements` section.

#### Scenario: Main spec accidentally contains an ADDED header
- **WHEN** `parseMainSpec` receives content containing the line `## ADDED Requirements`
- **THEN** the issues array SHALL contain one entry with `kind: "delta-header"`, severity `error`, and a message naming the offending header

### Requirement: Parser SHALL parse a delta spec into its four operation buckets
The `parseDeltaSpec(content, filePath)` function SHALL split the content on `## ` top-level sections and return a `DeltaPlan` with four buckets: `added` (array of requirement blocks from `## ADDED Requirements`), `modified` (array from `## MODIFIED Requirements`), `removed` (array of requirement name strings from `## REMOVED Requirements`), and `renamed` (array of `{ from, to }` pairs from `## RENAMED Requirements`). Section headers SHALL be matched case-insensitively. A bucket whose section is absent SHALL be an empty array and the corresponding `sectionPresence` flag SHALL be `false`.

#### Scenario: Delta spec with ADDED and MODIFIED only
- **WHEN** `parseDeltaSpec` is called with content containing `## ADDED Requirements` (with one `### Requirement:` block) and `## MODIFIED Requirements` (with one block)
- **THEN** the returned plan's `added` SHALL have length 1, `modified` SHALL have length 1, `removed` and `renamed` SHALL be empty, and `sectionPresence` SHALL be `{ added: true, modified: true, removed: false, renamed: false }`

#### Scenario: REMOVED section with a bare requirement name
- **WHEN** the `## REMOVED Requirements` section body contains the line `### Requirement: Old Thing`
- **THEN** the `removed` array SHALL contain the string `"Old Thing"`

#### Scenario: Section header case-insensitivity
- **WHEN** the content contains `## added requirements` (lowercase)
- **THEN** the section SHALL be recognized and `sectionPresence.added` SHALL be `true`

### Requirement: Parser SHALL parse tasks.md checkbox lines
The `parseTasks(content, filePath)` function SHALL return an array of `TaskItem` objects, one per top-level checkbox line (`- [ ]` or `- [x]`), preserving order. Each `TaskItem` SHALL include the raw label text, the checked boolean, the line number, and any nested sub-items (indented checkbox lines) as a `children` array. Lines that are not checkbox lines SHALL be ignored.

#### Scenario: Mixed checked and unchecked tasks with a sub-item
- **WHEN** `parseTasks` receives content with `- [x] First`, `- [ ] Second`, and an indented `  - [ ] Sub`
- **THEN** the returned array SHALL have two top-level items, the first with `checked: true` and an empty `children` array, the second with `checked: false` and a `children` array of length 1

#### Scenario: Non-checkbox prose line is ignored
- **WHEN** the content contains a paragraph line `Some notes here.` between two checkbox lines
- **THEN** only the two checkbox lines SHALL produce `TaskItem` objects

### Requirement: Parser SHALL parse config.yaml for dashboard-relevant keys
The `parseConfigYaml(content)` function SHALL return an object with `defaultSchema` (string or null), `profiles` (array of strings, possibly empty), and `tools` (array of strings, possibly empty), parsed from the `openspec/config.yaml` format. Unknown keys SHALL be ignored without error. A malformed or empty file SHALL return all fields as null/empty rather than throwing.

#### Scenario: Config with defaultSchema and a tools list
- **WHEN** `parseConfigYaml` receives `defaultSchema: spec-driven\ntools:\n  - claude\n  - cursor`
- **THEN** the result SHALL be `{ defaultSchema: "spec-driven", profiles: [], tools: ["claude", "cursor"] }`

#### Scenario: Empty config file
- **WHEN** `parseConfigYaml` receives an empty string
- **THEN** the result SHALL be `{ defaultSchema: null, profiles: [], tools: [] }` with no thrown exception

### Requirement: Parser SHALL collect issues rather than throwing on malformed input
Every parser entry point SHALL return `{ model, issues }` (or `{ items, issues }`) and SHALL NOT throw on malformed Markdown. An unrecoverable file (e.g. unreadable encoding) SHALL be represented as an empty model with a single issue of severity `error` naming the file and reason. Issue objects SHALL include `file`, `line?` (1-based when applicable), `severity` (`"warn" | "error"`), `kind` (a stable string identifier), and `message`.

#### Scenario: Totally unparseable file
- **WHEN** a parser entry point is given content it cannot structurally interpret at all
- **THEN** it SHALL return an empty model/items array and an issues array with one `error`-severity entry whose `message` explains the failure, and SHALL NOT throw

#### Scenario: Partially malformed file yields model plus warning
- **WHEN** a delta spec is missing its `## ADDED Requirements` body but has a valid `## MODIFIED Requirements` section
- **THEN** the returned plan SHALL contain the modified requirement, and the issues array SHALL contain a `warn` entry noting the empty/missing ADDED body
