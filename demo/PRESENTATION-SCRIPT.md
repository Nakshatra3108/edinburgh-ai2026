# FOLLOW: two-minute live presentation

For the event's two-minute presentation and one-minute Q&A. Person A speaks; the other teammates support the demo. Spoken text below is 211 words, leaving room for the audience to see the canvas change. Rehearse the timing aloud on the actual computer.

## Before the judges arrive

Upload `output/pdf/FOLLOW-Showcase.pdf`, include all seven pages, build the knowledge base and inspect the prepared topics. Load and warm Whisper, check microphone permission, then open Audience preview. Begin listening just before the pitch. Do not spend pitch time uploading or downloading models. Keep a studio tab or a quick route back to typed input available.

Person B operates the computer and handles Audience preview. Person C checks the microphone and live status before the pitch. Person D times the pitch and keeps the recovery phrases ready. The narrator should not need to operate the canvas during a successful voice demo.

The PDF supplies reference material. It does not guarantee that every live request produces a particular layout. Rehearse the actual document: a source-backed topic card may appear first, followed by a more structured AI refinement. Claim only the visual that is actually on screen.

## 0:00-0:15 | State the flip

**Screen:** Audience preview; live listening active. An empty stage is acceptable initially.

**Say:**

> Usually, a speaker follows their slides. We flipped that: the visuals follow the speaker. This is FOLLOW, and we're using FOLLOW to explain itself from an uploaded document.

**Expected:** A source-backed idea about the reversal may appear. Continue naturally; the opening sentence itself gives the judges the old assumption and the inversion.

## 0:15-0:35 | Explain the mechanism

**Screen:** Same canvas. No next-slide action.

**Say:**

> The workflow has four stages: build the knowledge base, transcribe speech, retrieve source material, and refine the explanation. Our PDF becomes reference material. As I speak, the system finds relevant evidence and brings it onto this canvas.

**Expected:** A workflow topic appears; an ordered process can follow when generated and grounded. Point at the actual visual, without calling it a four-step diagram if only a topic card is visible.

## 0:35-0:55 | Make the reversal visible

**Say:**

> Compare fixed slides with FOLLOW. Slides follow a prewritten order and separate information into pages. FOLLOW follows the current explanation and brings relevant ideas together. If someone interrupts with a question, I can change direction instead of searching through a deck.

**Expected:** The comparison topic or two grounded comparison sides. A change of subject on the same canvas is the key demonstration, even if the initial response is a local source match.

## 0:55-1:12 | Show the actual AI

**Say:**

> Whisper transcribes audio locally. Source matching gives an early visual; Groq refines it into structured content. React Flow renders the canvas, and TypeScript and Zod validate the data.

**Expected:** A technical topic. Point briefly at source provenance if visible. This acknowledges the AI tools and explains why each major component is present.

## 1:12-1:30 | Return to an earlier idea

**Say:**

> Now, back to the workflow: build knowledge, transcribe speech, retrieve sources, refine visuals. I changed the explanation, and the same canvas can return to that topic without a slide number.

**Expected:** The workflow returns. Allow the audience to observe the actual change. Do not say it has returned before it does. If it has not changed yet, omit the last sentence and continue with the trust explanation.

## 1:30-1:48 | Explain trust and usefulness

**Say:**

> Generated claims need quotations from our document. Unsupported speech keeps the last useful visual. A teacher, student or technical team can explain in their own order while keeping the evidence visible.

**Expected:** A source-checking topic or the last valid visual, with page provenance where applicable. There is no need to force another remote generation before closing.

## 1:48-2:00 | Close

**Say:**

> We flipped who leads the presentation. The speaker makes the argument; the software follows. That's FOLLOW.

**Action:** Let the final canvas remain visible. Finish on time; use the Q&A for capacity numbers, key rotation and implementation detail.

## Short version if the judges interrupt

> FOLLOW flips presentation control: the speaker leads, and the visuals follow. We upload a PDF as a knowledge base. Local Whisper transcribes speech, source matching finds evidence, and Groq refines structured processes, comparisons and metrics on one canvas. We are using the product to explain the product. Its current limits are latency, source quality and the supported visual layouts.

## Exact backup inputs

If microphone recognition fails, pause listening, return to the studio and use **Type an explanation**. Pausing first prevents incoming microphone transcripts from competing with the typed explanation. Return to Audience preview after submitting. Use:

- `Explain the four-stage workflow: build knowledge, transcribe speech, retrieve sources and refine visuals.`
- `Compare fixed slides with FOLLOW: prewritten page order versus an evolving canvas led by the current explanation.`
- `Explain source checking: generated claims cite exact quotations and source pages from the document.`
- `The active board shows up to 3 visual elements at once for readability.`
- `New Groq requests rotate through configured keys every 5 minutes; rate-limited keys remain on cooldown.`

If switching to typing, say: **"I'll use typed input to show the same composition path; the voice recognition is the part we're bypassing."** A teammate may enter the text while Person A continues explaining.

If Groq is limited, say: **"This is the local source-matching response. Fresh AI refinement is unavailable right now."** Keep presenting the working local path. Do not call the local response fresh AI generation. Do not cycle keys manually on stage or promise that rotation resets quotas.

If the app cannot continue, use an existing saved capture only if available and explicitly introduce it as a recorded or curated demonstration. No recording is included with this script.

## One-minute Q&A: short, truthful answers

**Is this just a voice-controlled slide clicker?**

The source is a knowledge base, not an ordered deck. Speech selects relevant material and can request structured visuals in a different order. The renderer currently uses a bounded set of layouts; it does not draw anything imaginable.

**What does AI actually do?**

Whisper performs speech recognition. Groq prepares the topic index and proposes structured visuals for the current explanation. Local lexical retrieval supplies an early source-backed response; it is not a new model answer.

**How do you prevent hallucinations?**

We locate proposed quotations in the PDF text and check the returned references again in the browser. Unsupported content is removed. This checks provenance; it does not prove every paraphrase is semantically correct.

**Why this stack?**

React Flow handles the persistent spatial canvas. PDF.js provides source text. Local Whisper keeps microphone audio on the device. Groq supplies language reasoning; TypeScript and Zod keep the rendering contract explicit.

**What happens when the API hits a limit?**

New requests rotate available Groq credentials every five minutes, with immediate failover on a rate-limit error and cooldowns based on reset information. In-flight work keeps its selected key. If all credentials are limited, local source matching and the existing visual remain available. Keys within one organization share its overall quota.

**Is it instant or offline?**

No zero-latency claim. Audio uses overlapping 3.5-second windows, and local transcription takes time. Supported local matches do not wait for Groq. Fresh AI generation requires internet access; the first Whisper download does too.

**What is working, and what is limited?**

PDF extraction, automatic source checking, local transcription, source matching, structured composition, audience rendering and key rotation are implemented. No OCR, durable project storage, generated photography or arbitrary drawing is claimed. Automated microphone wiring checks used synthetic audio and fixture transcripts; real-room accuracy needs rehearsal.

**Which AI tools helped build the project?**

Codex assisted with implementation, debugging and testing. Inside the product, Whisper handles speech recognition and Groq structures visuals. Local source retrieval is a separate deterministic path. We can explain these parts and their limits.

**What would you build next?**

Better topic matching across paraphrases, broader document support, and user testing of whether audiences understand explanations better. We have not measured that user benefit yet.

## Three highest-impact rehearsal priorities

1. Show the subject change and return to the workflow. The creativity claim becomes convincing when the visual follows that jump.
2. Rehearse the exact PDF and three core phrases in the real room. Confirm which process/comparison layouts appear; simplify the spoken claims to match the result.
3. Protect the two-minute limit. Preload everything, give one person control of the computer, and agree on the typed-input recovery before the pitch.

## Last check

- Start the API and web app; restart the API after editing keys.
- Upload the updated PDF and build a fresh knowledge base. Do not present an earlier document version.
- Warm the microphone model and check the actual room sound.
- Rehearse once in Audience preview without manual canvas intervention.
- Test one topic jump, one return, and pause listening.
- Keep unsupported market claims, invented speed figures and promises of unlimited API access out of the pitch.
