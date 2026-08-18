import zipfile, re, sys
z = zipfile.ZipFile('CDC Summary Report Software Feedback.pptx')
slides = [f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
slides.sort(key=lambda x: int(re.search(r'\d+', x).group()))
for s in slides:
    content = z.read(s).decode('utf-8')
    texts = re.findall(r'<a:t>(.*?)</a:t>', content)
    print(f'\n--- {s} ---')
    print('\n'.join(texts))
