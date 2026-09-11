"""Import optional, private reference data; never redistribute the source images."""
import json
import shutil
import sys
from pathlib import Path

source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'workspace/kaggle_pokepoke_2'
out = Path(__file__).resolve().parents[1] / 'assets'
out.mkdir(exist_ok=True)
cards = json.loads((source / 'data/all_cards.json').read_text())
attacks = {a['attackId']: a for a in json.loads((source / 'data/all_attacks.json').read_text())}
jp = json.loads((source / 'tools/visualizer/assets/jp_cards.json').read_text())
catalog = {}
for card in cards:
    cid = str(card['cardId'])
    entry = {'id': cid, 'name': card['name'], 'jp': jp['cards'].get(cid, card['name']), 'hp': card['hp'],
             'type': card['cardType'], 'abilities': jp.get('abilities', {}).get(cid, []),
             'attacks': [jp['attacks'].get(str(a), [attacks.get(a, {}).get('name', ''), '']) for a in card['attacks']]}
    catalog.setdefault(card['name'], []).append(entry)
(out / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False))
images = source / 'tools/visualizer/assets/cards_jp'
if images.exists():
    shutil.copytree(images, out / 'cards_jp', dirs_exist_ok=True)
print(f'Imported {len(catalog)} reference card names into {out} (ignored by Git).')
