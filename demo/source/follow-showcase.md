# FOLLOW
## The presentation follows you.

FOLLOW turns a source document into a visual explanation that responds to the speaker. A presenter uploads a PDF, builds a knowledge base and starts explaining. Relevant ideas, processes, comparisons and source-backed numbers appear on one persistent canvas.

### The old assumption
A traditional slide deck assumes the speaker should follow a sequence prepared before the talk. When a question changes the discussion, the presenter must search for the right slide or jump backwards through the deck.

### The flip
In FOLLOW, the visuals follow the speaker. The explanation determines what appears, rather than the slide order determining what the presenter says. The uploaded PDF supplies knowledge; it does not become a fixed slide sequence.

### Who it helps
Students can explain a project in their own words. Teachers can revisit a concept when a learner asks a question. Technical teams can move between a system overview, a process and a comparison without navigating a deck.

### Why it matters
The intended benefit is a presentation that can follow a conversation. The speaker keeps control of the argument, while the canvas makes the relevant source material visible to the audience.

---

# From document to explanation
## Four stages, one evolving canvas.

FOLLOW connects document preparation, speech recognition, source retrieval and visual composition. The four stages, in order, are: Build knowledge, Transcribe speech, Retrieve sources and Refine visuals.

### 1. Build the knowledge base
The presenter uploads a text-based PDF. PDF.js extracts its text locally. The presenter can select pages and correct extraction errors. The complete selected text is retained, and Groq prepares a source-checked topic index. Manual review is optional.

### 2. Transcribe the speech
The presenter loads the local voice model and starts listening. Whisper Tiny English converts microphone audio into text on the computer. Typed explanations use the same visual-composition workflow without a microphone or voice-model download.

### 3. Retrieve source material
Each usable transcript searches already grounded topics and retained source text. A relevant local match can update the canvas before a remote AI response arrives. Unknown or unsupported speech preserves the last useful visual.

### 4. Refine the explanation
Groq receives the transcript and selected source text. It proposes structured visuals, which are checked against source quotations before rendering. Newer speech can update the board while a generation request is pending.

### The presenter's controls
The studio offers source inspection, optional editing, typed rehearsal, an Overview of introduced ideas and an Audience preview. Pause listening stops microphone capture and preserves the current canvas.

---

# Fixed slides versus FOLLOW
## The source stays fixed. The explanation can move.

Fixed slides and FOLLOW use different presentation structures. Fixed slides organize the talk as a predetermined sequence of pages. FOLLOW organizes the presentation around what the speaker is explaining now.

### Fixed slides
With fixed slides, the visual order is decided before the talk. Each slide contains a prepared arrangement of content. Revisiting an earlier idea usually means navigating to another slide. A question can interrupt the planned sequence even when the answer is already in the source document.

### FOLLOW
With FOLLOW, the current explanation determines the visual focus. A process can appear as connected steps. Contrasting ideas can appear side by side. A quoted quantity can appear as a metric. Earlier material remains accessible through the canvas Overview.

### Order
Fixed slides follow a prewritten order. FOLLOW follows the speaker's current explanation.

### Structure
Fixed slides separate information into pages. FOLLOW brings relevant visual elements together on one evolving canvas.

### Questions
Fixed slides require the presenter to find the right page. FOLLOW can retrieve source-backed material for a new spoken explanation.

### The distinction
FOLLOW still benefits from preparation and rehearsal. The reversal concerns who controls the visual sequence: the speaker's explanation leads, and the display follows it.

---

# Two paths to a useful visual
## Respond locally. Refine with AI.

FOLLOW uses a local response path and a remote AI refinement path. The local path retrieves existing source-backed material quickly. The AI path proposes a more tailored visual explanation from the document and current speech.

### Local source retrieval
The local path matches transcript words against the prepared topic index and retained PDF text. It can reuse a relevant process or comparison, or display exact source excerpts. This is deterministic retrieval, not a new language-model answer.

### Groq refinement
The remote path uses Groq to interpret the explanation and choose a structured visual type. A mechanism can become an ordered process. An explicit contrast can become a comparison. A stated quantity can become a metric. The browser renders the validated structure using authored visual components.

### Continuous speaking
The local path remains available while Groq is busy. Only the newest pending explanation is retained, rather than appending duplicate speech windows. A superseded topic response cannot replace a newer matched topic. A relevant refinement replaces its provisional preview instead of adding a duplicate card.

### Provider resilience
New Groq requests rotate through available configured keys every 5 minutes. In-flight requests keep their selected key. A rate-limited key stays on cooldown; another available key can serve the next attempt. Rotation does not reset account quotas. Local source matching remains available when every remote key is limited.

### Timing
The first display does not need to wait for Groq when a supported local match exists. Microphone capture and speech recognition still take time. Fresh AI composition depends on the network, provider latency and account quota.

---

# Built to explain, not to guess
## Source evidence stays attached.

FOLLOW treats the PDF as reference material. A generated concept or supporting detail must cite text from the document. The system records the source page, the exact quotation and its location in the extracted page text.

### Checking a claim
The server locates proposed quotations in the selected source pages. Unmatched quotations and unsupported generated content are removed. The browser checks the received quotations against its own retained knowledge base before applying the scene.

### Showing evidence
Source-backed visual elements display their page provenance. A metric requires a quoted value, so a number is not invented merely to make the presentation look convincing. A comparison requires supported sides and a verified comparison relationship.

### When the answer is missing
FOLLOW preserves the existing visual when speech is unrelated or lacks supporting material. A failed generation request also preserves the last useful canvas. The presenter can pause, inspect the source or try a clearer explanation.

### Human judgment
Source checking verifies that cited text exists; it does not prove every AI paraphrase is correct. Optional inspection and editing remain available. A speaker is still responsible for the explanation presented to the audience.

### Document integrity
The complete selected source text remains available even if the small topic index misses an idea. Live composition can therefore use information beyond the initial index.

---

# Inside FOLLOW
## Local capture, structured intelligence, shared rendering.

FOLLOW combines a desktop web interface, local speech recognition and a small API service. The studio and Audience preview share the same canvas renderer, so the audience sees the explanation being built in the studio.

### Interface and canvas
React and TypeScript implement the interface. Vite builds and serves the web app. React Flow positions visual elements and connections on the persistent canvas. CSS and vector icons render processes, comparisons and metrics without generating new image files.

### Documents and voice
PDF.js extracts selectable PDF text. Transformers.js runs the local Whisper Tiny English model. The microphone is captured through an AudioWorklet and passed to the speech worker in overlapping audio chunks.

### AI and validation
The Fastify API service sends selected document text and the transcript to Groq. Zod validates structured data. Exact-quote grounding links accepted content to the source. The renderer consumes structured data rather than executing model-generated HTML.

### Privacy boundaries
Microphone audio stays on the computer for transcription. Groq receives selected source text and the transcript. API keys stay in the server process. Original PDF figures, when used, are rendered locally rather than sent as image pixels to Groq.

### This showcase
This document contains text only. Its processes, comparisons and quantities can become visuals inside FOLLOW; the PDF itself contains no screenshots, diagrams or embedded images.

---

# Capabilities and honest limits
## A focused prototype with a clear purpose.

FOLLOW demonstrates a reversal in presentation control: the explanation leads the display. Its current limits are deliberate implementation boundaries, not claims of measured user impact or unlimited performance.

### Three visible elements
The active board shows up to 3 visual elements at once for readability. It can place a primary explanation beside recent context, or show the two sides of a comparison. This is a display limit, not a restriction to three topics in the knowledge base.

### Twenty-four concepts in history
The canvas retains up to 24 introduced concepts in its bounded visual history. Overview exposes earlier introduced material. The retained document text remains available when older visual elements leave that history.

### Speech windows
Microphone audio is processed in overlapping 3.5-second windows. Local transcription and source matching can proceed while a Groq request is pending. This does not imply zero-latency recognition or instantaneous new AI generation.

### Current boundaries
The prototype targets desktop presentation. Text extraction does not perform OCR on scanned pages. Groq requires internet access and available quota; keys in one organization share its overall limits. Project state is held in the browser session, so it is not durable project storage. Visuals use supported authored layouts rather than arbitrary AI drawing or generated photography.

### The takeaway
Prepare the knowledge. Explain naturally. Let the canvas follow. FOLLOW makes the presentation itself a demonstration of the idea: the speaker leads, and the software brings the relevant evidence into view.
