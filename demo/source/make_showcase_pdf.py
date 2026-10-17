"""Build the text-only FOLLOW showcase PDF from its editable Markdown source.
Run with Python + reportlab. No external resources or raster assets are used.
"""
from pathlib import Path
from html import escape
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(__file__).with_name('follow-showcase.md')
OUTPUT=ROOT/'output/pdf/FOLLOW-Showcase.pdf'
INK=HexColor('#20253D');MUTED=HexColor('#4F5972');BRAND=HexColor('#5945CC')
styles={
 'title':ParagraphStyle('title',fontName='Helvetica-Bold',fontSize=32,leading=36,textColor=INK,spaceAfter=12),
 'subtitle':ParagraphStyle('subtitle',fontName='Helvetica',fontSize=16,leading=22,textColor=BRAND,spaceAfter=22),
 'heading':ParagraphStyle('heading',fontName='Helvetica-Bold',fontSize=13,leading=18,textColor=INK,spaceBefore=12,spaceAfter=5,keepWithNext=True),
 'body':ParagraphStyle('body',fontName='Helvetica',fontSize=11.5,leading=17,textColor=INK,spaceAfter=6),
}
def footer(canvas,doc):
 canvas.saveState();canvas.setFont('Helvetica-Bold',9);canvas.setFillColor(BRAND)
 canvas.drawString(48,807,'FOLLOW')
 canvas.setFont('Helvetica',9);canvas.setFillColor(MUTED)
 canvas.drawRightString(A4[0]-48,807,'The presentation follows you.')
 canvas.drawString(48,30,'SHOWCASE SOURCE  /  TEXT ONLY')
 canvas.drawRightString(A4[0]-48,30,f'{doc.page} / 7')
 canvas.restoreState()
def build():
 OUTPUT.parent.mkdir(parents=True,exist_ok=True)
 text=SOURCE.read_text();assert text.isascii(),'Use ASCII source for reliable PDF extraction.'
 sections=text.strip().split('\n---\n');assert len(sections)==7
 flow=[]
 for i,section in enumerate(sections):
  if i:flow.append(PageBreak())
  for block in re.sub(r'(?m)^(#{1,3} [^\n]+)\n(?!\n)', r'\1\n\n', section.strip()).split('\n\n'):
   kind='body';value=block.strip()
   for prefix,name in [('### ','heading'),('## ','subtitle'),('# ','title')]:
    if value.startswith(prefix):kind=name;value=value[len(prefix):];break
   flow.append(Paragraph(escape(value),styles[kind]))
 document=SimpleDocTemplate(str(OUTPUT),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=65,bottomMargin=56,
  title='FOLLOW - The presentation follows you',author='FOLLOW team',subject='Text-only source document for a live FOLLOW demonstration',pageCompression=1)
 document.build(flow,onFirstPage=footer,onLaterPages=footer)
 print(OUTPUT)
if __name__=='__main__':build()
