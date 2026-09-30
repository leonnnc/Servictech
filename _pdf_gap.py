import fitz
path = r"C:\Users\leonn\Documents\Informe_0002-2026 dd.pdf"
doc = fitz.open(path)
h_cm = doc[0].rect.height/72.0*2.54
print("PAGES:", doc.page_count, " page height cm=%.1f" % h_cm)
for i, page in enumerate(doc):
    pm = page.get_pixmap(dpi=100)
    w, hh, n = pm.width, pm.height, pm.n
    s = pm.samples
    footer_top = int(812.6/841.9*hh)   # y of footer text top in px
    def rowdark(y, x0=0, x1=None):
        x1 = x1 or w
        base=y*w*n; c=0
        for x in range(x0, x1, 2):
            idx=base+x*n
            if s[idx]<235 or s[idx+1]<235 or s[idx+2]<235: c+=1
        return c
    # body content rows strictly above footer band
    body = [y for y in range(int(hh*0.02), footer_top-6) if rowdark(y)>0]
    first_body = body[0] if body else None
    last_body  = body[-1] if body else None
    # gap between last body row and footer text top
    gap_px = (footer_top - last_body) if last_body else 0
    # also detect internal large white gaps in body (>1.2cm)
    gaps=[]
    prev=None
    for y in body:
        if prev is not None and y-prev> int(hh*0.04):
            gaps.append((prev, y, (y-prev)/hh*h_cm))
        prev=y
    print(f"P{i+1}: footer_top={footer_top}px | first_body={first_body}({first_body/hh*100:.1f}%) | last_body={last_body}({last_body/hh*100:.1f}%) | GAP to footer={gap_px}px={gap_px/hh*100:.1f}%={gap_px/hh*h_cm:.1f}cm")
    if gaps:
        for g in gaps:
            print(f"     internal white gap {g[0]}->{g[1]}px = {g[2]:.1f}cm")
doc.close()
