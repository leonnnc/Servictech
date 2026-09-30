import fitz
src = r"C:\Users\leonn\Documents\Informe_0002-2026 dd.pdf"
out = r"C:\Users\leonn\Documents\web\Servitech\_pdf_feet.pdf"
doc = fitz.open(src)
newdoc = fitz.open()
for i, page in enumerate(doc):
    r = page.rect
    # bottom 60% of the page (where the foot gap is visible)
    clip = fitz.Rect(r.x0, r.y0 + r.height*0.40, r.x1, r.y1)
    pm = page.get_pixmap(dpi=140, clip=clip)
    img_bytes = pm.tobytes("png")
    rect = fitz.Rect(0, 0, pm.width, pm.height)
    p = newdoc.new_page(width=pm.width, height=pm.height)
    p.insert_image(rect, stream=img_bytes)
newdoc.save(out)
print("SAVED", out)
