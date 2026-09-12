"""Build name/ID metadata only. Artwork and card effect text are never copied."""
import json,re,sys,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]).expanduser() if len(sys.argv)>1 else Path.home()/'workspace/kaggle_pokepoke_2'
engine=json.loads((source/'data/all_cards.json').read_text())
jp=json.loads((source/'tools/visualizer/assets/jp_cards.json').read_text())
with urllib.request.urlopen('https://api.tcgdex.net/v2/ja/cards',timeout=30) as response: public=json.load(response)
def key(name):
    return name.replace('’',"'").replace('【','').replace('】','').strip()
names={};moves={};index={}
energy={'G':'Grass','R':'Fire','W':'Water','L':'Lightning','P':'Psychic','F':'Fighting','D':'Darkness','M':'Metal'}
for c in engine:
    name=c['name'];m=re.fullmatch(r'Basic \{([GRWLPFDM])\} Energy',name)
    if m:name=f'Basic {energy[m[1]]} Energy'
    names[key(name)]=key(jp['cards'].get(str(c['cardId']),name))
attacks=json.loads((source/'data/all_attacks.json').read_text())
for a in attacks:
    translated=jp.get('attacks',{}).get(str(a['attackId']))
    if translated:moves[key(a['name'])]=translated[0]
for c in engine:
    for a,b in zip(c.get('skills',[]),jp.get('abilities',{}).get(str(c['cardId']),[])):moves[key(a['name'])]=b[0]
for c in public:
    name=key(c['name'])
    if name.replace(' ','') in {n.replace(' ','') for n in names.values()}:index.setdefault(name.replace(' ',''),[]).append({'id':c['id'],'image':c.get('image')})
(root/'data/japanese-index.json').write_text(json.dumps({'names':names,'moves':moves,'cards':index},ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Names {len(names)}, moves {len(moves)}, public Japanese card references {sum(map(len,index.values()))}')
