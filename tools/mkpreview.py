import os,re,shutil,sys
src_root='dist'; out='preview'
shutil.rmtree(out,ignore_errors=True)
for site in sorted(os.listdir(src_root)):
    base=os.path.join(src_root,site)
    for d,_,fs in os.walk(base):
        for f in fs:
            p=os.path.join(d,f)
            rel=os.path.relpath(p,base)
            dst=os.path.join(out,site,rel)
            os.makedirs(os.path.dirname(dst),exist_ok=True)
            if f in('robots.txt','sitemap.xml'): continue
            if f.endswith('.html'):
                depth=rel.count(os.sep)
                pre='../'*depth if depth else './'
                h=open(p,encoding='utf8').read()
                def fix(m):
                    attr,u=m.group(1),m.group(2)
                    if not u.startswith('/') or u.startswith('//'): return m.group(0)
                    path,frag=(u.split('#',1)+[''])[:2]
                    frag='#'+frag if frag else ''
                    if path.endswith('/'): path+='index.html'
                    return f'{attr}="{pre}{path.lstrip("/")}{frag}"'
                h=re.sub(r'\b(href|src|action)="([^"]*)"',fix,h)
                open(dst,'w',encoding='utf8').write(h)
            else:
                shutil.copy(p,dst)
