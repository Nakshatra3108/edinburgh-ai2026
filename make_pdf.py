from reportlab.lib.pagesizes import A4
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Flowable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#555555")
RED = colors.HexColor("#D0001F")
LINE = colors.HexColor("#DDDDDD")

title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=INK, spaceAfter=6)
sub = ParagraphStyle("s", fontName="Helvetica", fontSize=14, leading=20, textColor=MUTED, spaceAfter=18)
h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=26, textColor=INK, spaceBefore=6, spaceAfter=10)
label = ParagraphStyle("l", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=RED, spaceAfter=4)
body = ParagraphStyle("b", fontName="Helvetica", fontSize=11.5, leading=17, textColor=INK, spaceAfter=9)
bullet = ParagraphStyle("bl", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=5)
cell = ParagraphStyle("c", fontName="Helvetica", fontSize=10.5, leading=14, textColor=INK)
cellh = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=colors.white)
quote = ParagraphStyle("q", fontName="Helvetica-Bold", fontSize=16, leading=22, textColor=RED, spaceBefore=8, spaceAfter=14)
foot = ParagraphStyle("f", fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED)


class Pipeline(Flowable):
    """Figure 1: four-step pipeline drawn as vectors."""
    steps = [("1. Capture", "Listen to the speaker"),
             ("2. Understand", "Turn speech into text"),
             ("3. Match", "Find the prepared concept"),
             ("4. Compose", "Arrange it on the canvas")]

    def __init__(self, width):
        super().__init__()
        self.width, self.height = width, 34 * mm

    def draw(self):
        c = self.canv
        n = len(self.steps)
        gap = 7 * mm
        w = (self.width - gap * (n - 1)) / n
        h = 22 * mm
        y = 8 * mm
        for i, (t, d) in enumerate(self.steps):
            x = i * (w + gap)
            c.setStrokeColor(RED if i == 2 else INK)
            c.setLineWidth(1.6 if i == 2 else 1)
            c.roundRect(x, y, w, h, 3 * mm, stroke=1, fill=0)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(x + w / 2, y + h - 8 * mm, t)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8.5)
            c.drawCentredString(x + w / 2, y + 6 * mm, d)
            if i < n - 1:
                ax = x + w + 1.2 * mm
                ay = y + h / 2
                c.setStrokeColor(INK)
                c.setLineWidth(1)
                c.line(ax, ay, ax + gap - 2.4 * mm, ay)
                c.line(ax + gap - 2.4 * mm, ay, ax + gap - 4.2 * mm, ay + 1.6 * mm)
                c.line(ax + gap - 2.4 * mm, ay, ax + gap - 4.2 * mm, ay - 1.6 * mm)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 8.5)
        c.drawString(0, 1.5 * mm, "Figure 1. The FOLLOW pipeline. Steps 1 to 4 run continuously while the speaker talks.")


def page_footer(c, doc):
    c.saveState()
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawString(20 * mm, 12 * mm, "FOLLOW: a presentation that listens")
    c.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    c.restoreState()


def build(path):
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=22 * mm, bottomMargin=22 * mm,
                            title="FOLLOW: a presentation that listens",
                            author="EdinburghAI Hackathon Team", subject="Flip the Script")
    W = A4[0] - 40 * mm
    s = []

    # Page 1: title + problem
    s += [Paragraph("FOLLOW", title),
          Paragraph("A presentation that listens. Built for the EdinburghAI hackathon challenge, Flip the Script.", sub),
          Paragraph("Usually, speakers follow their slides. With FOLLOW, the presentation follows the speaker.", quote),
          Paragraph("THE PROBLEM", label),
          Paragraph("Slides lock speakers into a fixed order", h1),
          Paragraph("A slide deck is a sequence decided before the talk begins. The speaker organises their "
                    "explanation around that sequence, even when the conversation in the room wants to go somewhere else.", body),
          Paragraph("This becomes awkward in three common moments:", body),
          Paragraph("When someone asks a question about an earlier point, the speaker has to search backwards through the deck.", bullet, bulletText="\u2022"),
          Paragraph("When the explanation naturally takes a different direction, the slides fall out of step with the words.", bullet, bulletText="\u2022"),
          Paragraph("When the speaker stops to operate the clicker, the audience loses the thread of the argument.", bullet, bulletText="\u2022"),
          Paragraph("The audience sees the speaker serving the slides, instead of the slides serving the speaker.", body),
          PageBreak()]

    # Page 2: the reversal + pipeline
    s += [Paragraph("THE REVERSAL", label),
          Paragraph("The speech decides what the audience sees", h1),
          Paragraph("FOLLOW removes the slide sequence entirely. The speaker prepares source material once, "
                    "then explains it naturally in any order. The presentation listens and brings the right concept onto one continuous canvas.", body),
          Paragraph("Conventional workflow: write slides, rehearse their order, then operate the slides while speaking.", bullet, bulletText="\u2022"),
          Paragraph("FOLLOW workflow: prepare the knowledge, speak naturally, and let the visuals form around the speech.", bullet, bulletText="\u2022"),
          Spacer(1, 10),
          Paragraph("HOW IT WORKS", label),
          Paragraph("Four steps: capture, understand, match, compose", h1),
          Paragraph("Capture listens to the speaker through the laptop microphone. Understand turns the speech into text on the device. "
                    "Match compares the meaning of the latest words with the concepts prepared from the document. "
                    "Compose arranges the matching concept, its details and its connections on the canvas.", body),
          Spacer(1, 6),
          Pipeline(W),
          PageBreak()]

    # Page 3: matching + comparison
    s += [Paragraph("MATCHING", label),
          Paragraph("Matching by meaning, and holding when unsure", h1),
          Paragraph("FOLLOW matches meaning rather than exact keywords, so the speaker can paraphrase freely instead of reciting a script.", body),
          Paragraph("When the system is not confident, it holds the current view instead of guessing. Silence, filler words and "
                    "off-topic remarks never move the canvas.", body),
          Paragraph("The speaker always stays in control. A single key press overrides the system, and a manual choice "
                    "always beats a late automatic decision.", body),
          Spacer(1, 10),
          Paragraph("SLIDES VERSUS FOLLOW", label),
          Paragraph("Fixed slides compared with a speech-directed canvas", h1)]
    rows = [["", "Fixed slides", "FOLLOW canvas"],
            ["Order", "Decided before the talk", "Decided by the speech"],
            ["Format", "Separate pages", "One continuous canvas"],
            ["Control", "Clicker or keyboard", "The speaker's voice, with manual override"],
            ["Questions", "Search back through the deck", "Return to the earlier idea with its context"]]
    data = [[Paragraph(r[0], cellh if i == 0 else cell)] + [Paragraph(x, cellh if i == 0 else cell) for x in r[1:]]
            for i, r in enumerate(rows)]
    t = Table(data, colWidths=[W * 0.2, W * 0.38, W * 0.42])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    s += [t, Spacer(1, 4), Paragraph("Table 1. Fixed slides compared with the FOLLOW canvas.", foot), PageBreak()]

    # Page 4: architecture + closing
    s += [Paragraph("ARCHITECTURE", label),
          Paragraph("Prepared once with AI, presented live on the device", h1),
          Paragraph("Before the talk, an AI model reads the document once and proposes concepts, supporting facts and "
                    "relationships, each linked to the page it came from. The speaker reviews and approves this material.", body),
          Paragraph("During the talk, speech recognition and meaning matching run locally on the laptop. "
                    "Live audio is never sent to a server.", body),
          Paragraph("FOLLOW only shows approved material. It never invents new facts on stage.", body),
          Spacer(1, 10),
          Paragraph("CLOSING", label),
          Paragraph("A presentation that behaves like a conversation", h1),
          Paragraph("Good explanations rarely follow a straight line. FOLLOW lets the speaker answer questions, "
                    "revisit ideas and change direction, while the visuals keep up.", body),
          Paragraph("The speaker leads. The presentation follows.", quote)]

    doc.build(s, onFirstPage=page_footer, onLaterPages=page_footer)


if __name__ == "__main__":
    build("follow-demo.pdf")
