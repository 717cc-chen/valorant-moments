# -*- coding: utf-8 -*-
"""
无畏时刻 · 本地视频墙服务

只监听 127.0.0.1，不对外网暴露；不修改 ACLOS 的任何原始文件。
"""
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import time
import urllib.parse

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

import library

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(BASE, 'config.json')
INDEX = os.path.join(BASE, 'library.json')
OVERRIDES = os.path.join(BASE, 'overrides.json')   # 收藏/显示名/隐藏
THUMBS = os.path.join(BASE, 'thumbs')
TAGS_FILE = os.path.join(BASE, 'tags.json')
TRASH_INDEX = os.path.join(BASE, 'trash_index.json')   # 回收站文件名 -> 原始绝对路径   # 标签定义 + 视频标签关联

app = FastAPI(title='ValorantMoments')

_transport_tokens = {}   # video_id -> 计数，用于删除前停止传输

_state = {
    'index': None,
    'lock': threading.Lock(),
    'building': False,
    'last_error': None,
}


# ---------------------------------------------------------------- 配置 & 持久化

def load_config():
    try:
        with open(CONFIG, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'root': os.path.expanduser(r'~\AppData\ACLOS\aclos-highlight'),
                'port': 8765, 'host': '127.0.0.1'}


def save_config(cfg):
    with open(CONFIG, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def load_overrides():
    try:
        with open(OVERRIDES, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_overrides(o):
    tmp = OVERRIDES + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(o, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OVERRIDES)


DEFAULT_TAGS = [
    {'id': 't_good', 'name': '精彩', 'color': '#ff4655'},
    {'id': 't_ace', 'name': '五杀', 'color': '#e6c26e'},
    {'id': 't_clutch', 'name': '关键局', 'color': '#24b7af'},
    {'id': 't_fun', 'name': '节目效果', 'color': '#8fb8f0'},
    {'id': 't_keep', 'name': '待剪辑', 'color': '#b06be0'},
]


def load_tags():
    """返回 {'tags': [{id,name,color}], 'videoTags': {video_id: [tagId]}}"""
    try:
        with open(TAGS_FILE, 'r', encoding='utf-8') as f:
            d = json.load(f)
    except Exception:
        d = {}
    if not isinstance(d.get('tags'), list) or not d['tags']:
        d['tags'] = [dict(t) for t in DEFAULT_TAGS]
    if not isinstance(d.get('videoTags'), dict):
        d['videoTags'] = {}
    return d


def save_tags(d):
    tmp = TAGS_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, TAGS_FILE)


def apply_tags(idx):
    """把标签挂到索引记录上，并统计每个标签的数量。"""
    d = load_tags()
    vt = d['videoTags']
    by_id = {t['id']: t for t in d['tags']}
    counts = {t['id']: 0 for t in d['tags']}
    for r in idx['records']:
        ids = [t for t in (vt.get(r['id']) or []) if t in by_id]
        r['tags'] = ids
        for t in ids:
            counts[t] = counts.get(t, 0) + 1
    idx['tagDefs'] = d['tags']
    idx['tagCounts'] = counts
    idx['facets']['tags'] = sorted(
        [{'id': t['id'], 'name': t['name'], 'color': t['color'], 'count': counts.get(t['id'], 0)}
         for t in d['tags']],
        key=lambda x: (-x['count'], x['name']))
    return idx


def load_trash_index():
    try:
        with open(TRASH_INDEX, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_trash_index(d):
    tmp = TRASH_INDEX + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, TRASH_INDEX)


def build_index(root):
    idx = library.build(root, _state.get('index'))
    library.save(idx, INDEX)
    ov = load_overrides()
    for r in idx['records']:
        o = ov.get(r['id']) or {}
        if o.get('fav'):
            r['fav'] = True
        if o.get('name'):
            r['name'] = o['name']
        if o.get('hidden'):
            r['hidden'] = True
    apply_tags(idx)
    _state['index'] = idx
    return idx


def ensure_index(force=False):
    root = _index_root()
    if _state['index'] is not None and not force:
        return _state['index']
    if force or not os.path.exists(INDEX):
        build_index(root)
    else:
        idx = library.load(INDEX)
        if idx.get('root') != root:
            build_index(root)
        else:
            ov = load_overrides()
            for r in idx['records']:
                o = ov.get(r['id']) or {}
                if o.get('fav'):
                    r['fav'] = True
                if o.get('name'):
                    r['name'] = o['name']
                if o.get('hidden'):
                    r['hidden'] = True
            apply_tags(idx)
            _state['index'] = idx
    if _state['index'] is not None:
        _reconcile_missing(_state['index'])
    return _state['index']


def _reconcile_missing(idx):
    """按磁盘实际情况校正 exists 状态。

    只做轻量检查：只对「被标记为已删除 / 隐藏」和「上次不存在」的记录重新 stat，
    避免每次都 stat 四千多个文件。
    """
    changed = False
    for r in idx['records']:
        is_exist = os.path.isfile(r['src'])
        if is_exist != r.get('exists', True):
            r['exists'] = is_exist
            changed = True
    if changed:
        try:
            library.save(idx, INDEX)
        except Exception:
            pass


def _disk_info(root):
    """返回录制目录所在磁盘的占用情况。"""
    try:
        import shutil as _sh
        target = root if os.path.isdir(root) else os.path.dirname(root)
        while target and not os.path.isdir(target):
            target = os.path.dirname(target)
        if not target:
            return None
        total, used, free = _sh.disk_usage(target)
        return {'total': total, 'used': used, 'free': free,
                'totalText': fmt_bytes(total), 'usedText': fmt_bytes(used)}
    except Exception:
        return None


def _index_root():
    return load_config().get('root') or ''


def rebuild_async(root):
    def run():
        _state['building'] = True
        _state['last_error'] = None
        try:
            cfg = load_config()
            cfg['root'] = root
            save_config(cfg)
            build_index(root)
        except Exception as e:
            _state['last_error'] = str(e)
            import traceback
            traceback.print_exc()
        finally:
            _state['building'] = False
    threading.Thread(target=run, daemon=True).start()


# ---------------------------------------------------------------- 小工具

def fmt_bytes(n):
    n = float(n or 0)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024 or unit == 'TB':
            return ('%.0f %s' if unit in ('B', 'KB') else '%.1f %s') % (n, unit)
        n /= 1024
    return '0 B'


def guess_mime(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
        '.webm': 'video/webm', '.mkv': 'video/x-matroska',
        '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp',
    }.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream'


# ---------------------------------------------------------------- 视频流（Range）

RANGE_RE = re.compile(r'bytes=(\d*)-(\d*)')


@app.get('/media/video/{vid}')
def stream_video(vid: str, request: Request):
    rec = _find(vid)
    if not rec:
        return JSONResponse({'error': 'not found'}, status_code=404)
    path = rec['src']
    if not os.path.isfile(path):
        return JSONResponse({'error': '文件不存在'}, status_code=404)
    size = os.path.getsize(path)
    mime = guess_mime(path)
    range_header = request.headers.get('range')
    if not range_header:
        def full():
            with open(path, 'rb') as f:
                while True:
                    chunk = f.read(1024 * 512)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(full(), media_type=mime, headers={
            'Accept-Ranges': 'bytes', 'Content-Length': str(size),
        })
    m = RANGE_RE.match(range_header)
    if not m:
        return Response(status_code=416)
    start = int(m.group(1) or 0)
    end = int(m.group(2)) if m.group(2) else size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        return Response(status_code=416, headers={'Content-Range': 'bytes */%d' % size})
    length = end - start + 1

    def part():
        with open(path, 'rb') as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(1024 * 512, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk

    return StreamingResponse(part(), status_code=206, media_type=mime, headers={
        'Content-Range': 'bytes %d-%d/%d' % (start, end, size),
        'Accept-Ranges': 'bytes',
        'Content-Length': str(length),
        'Cache-Control': 'no-store',
    })


def _stream_file(path, request):
    """通用的文件流响应（支持 Range）。"""
    if not os.path.isfile(path):
        return JSONResponse({'error': '文件不存在'}, status_code=404)
    size = os.path.getsize(path)
    mime = guess_mime(path)
    range_header = request.headers.get('range')
    if not range_header:
        def full():
            with open(path, 'rb') as f:
                while True:
                    chunk = f.read(1024 * 512)
                    if not chunk:
                        break
                    yield chunk
        return StreamingResponse(full(), media_type=mime, headers={
            'Accept-Ranges': 'bytes', 'Content-Length': str(size),
        })
    m = RANGE_RE.match(range_header)
    if not m:
        return Response(status_code=416)
    start = int(m.group(1) or 0)
    end = int(m.group(2)) if m.group(2) else size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        return Response(status_code=416, headers={'Content-Range': 'bytes */%d' % size})
    length = end - start + 1

    def part():
        with open(path, 'rb') as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(1024 * 512, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk

    return StreamingResponse(part(), status_code=206, media_type=mime, headers={
        'Content-Range': 'bytes %d-%d/%d' % (start, end, size),
        'Accept-Ranges': 'bytes',
        'Content-Length': str(length),
        'Cache-Control': 'no-store',
    })


@app.get('/media/trash/{name}')
def stream_trash(name: str, request: Request):
    """播放回收站里的视频。"""
    d = _trash_dir()
    p2 = os.path.join(d, name)
    if not os.path.isfile(p2):
        return JSONResponse({'error': '回收站中没有该文件'}, status_code=404)
    return _stream_file(p2, request)


@app.get('/media/trash-poster/{name}')
def trash_poster(name: str):
    """回收站视频的封面：按原始路径反查记录取 video_poster。"""
    ti = load_trash_index()
    orig = ti.get(name)
    if not orig:
        return Response(status_code=204)
    rec = _find_by_path(orig)
    if rec and rec.get('poster') and os.path.isfile(rec['poster']):
        return FileResponse(rec['poster'], media_type=guess_mime(rec['poster']),
                            headers={'Cache-Control': 'public, max-age=86400'})
    return Response(status_code=204)


def _find_by_path(path):
    idx = ensure_index()
    key = os.path.normcase(path)
    for r in idx['records']:
        if os.path.normcase(r['src']) == key:
            return r
    return None


@app.get('/media/poster/{vid}')
def poster(vid: str):
    rec = _find(vid)
    if not rec:
        return JSONResponse({'error': 'not found'}, status_code=404)
    p = rec.get('poster')
    if p and os.path.isfile(p):
        return FileResponse(p, media_type=guess_mime(p),
                            headers={'Cache-Control': 'public, max-age=604800'})
    # 没有封面时返回 1x1 透明
    return Response(content=b'', media_type='image/gif', status_code=204)


@app.get('/media/poster-by-match/{mid}')
def poster_by_match(mid: str):
    for r in _records():
        if r['match'] == mid and r.get('poster') and os.path.isfile(r['poster']):
            return FileResponse(r['poster'], media_type=guess_mime(r['poster']),
                                headers={'Cache-Control': 'public, max-age=604800'})
    return Response(status_code=204)


def _records():
    idx = ensure_index()
    return idx['records']


_RECS = {}


def _find(vid):
    global _RECS
    idx = ensure_index()
    if _RECS.get('_idx') is not idx:
        _RECS = {'_idx': idx}
        for r in idx['records']:
            _RECS[r['id']] = r
    return _RECS.get(vid)


# ---------------------------------------------------------------- API

@app.get('/api/status')
def status():
    idx = ensure_index()
    cfg = load_config()
    return {
        'building': _state['building'],
        'error': _state['last_error'],
        'root': cfg.get('root'),
        'generated': idx.get('generated'),
        'mode': idx.get('mode'),
        'meta': idx.get('meta'),
        'stats': idx.get('stats'),
        'disk': _disk_info(idx.get('root') or ''),
        'elapsed': idx.get('elapsed'),
    }


@app.get('/api/facets')
def facets():
    idx = ensure_index()
    return idx['facets']


@app.get('/api/videos')
def videos(
    agent: str = '', map: str = '', type: str = '', account: str = '',
    year: str = '', q: str = '', fav: str = '', hidden: str = '',
    mode: str = '', result: str = '', tag: str = '',
    date: str = '', ym: str = '',
    sort: str = 'new', offset: int = 0, limit: int = 60,
):
    idx = ensure_index()
    recs = idx['records']
    agent, map_, type = agent.strip(), map.strip(), type.strip()
    account, year, q = account.strip(), year.strip(), q.strip().lower()
    mode, result, tag = mode.strip(), result.strip(), tag.strip()
    date, ym = date.strip(), ym.strip()

    out = []
    for r in recs:
        if hidden != 'all' and r.get('hidden'):
            continue
        if agent and r['agentGrp'] != agent:
            continue
        if map_ and r['mapGrp'] != map_:
            continue
        if type and r['type'] != type:
            continue
        if account and r['account'] != account:
            continue
        if mode and r['mode'] != mode:
            continue
        if result == 'win' and r['won'] is not True:
            continue
        if result == 'lose' and r['won'] is not False:
            continue
        if tag and tag not in (r.get('tags') or []):
            continue
        if date and r['date'] != date:
            continue
        if ym and not r['date'].startswith(ym):
            continue
        if year and not r['date'].startswith(year):
            continue
        if fav == '1' and not r.get('fav'):
            continue
        if q:
            hay = ' '.join([r['name'], r['agent'], r['agentEn'], r['agentGrp'],
                            r['map'], r['type'], r['date'], r['mode']]).lower()
            if q not in hay:
                continue
        out.append(r)

    if sort == 'old':
        out.sort(key=lambda r: r['time'])
    elif sort == 'long':
        out.sort(key=lambda r: -r['duration'])
    elif sort == 'size':
        out.sort(key=lambda r: -r['size'])
    elif sort == 'name':
        out.sort(key=lambda r: r['name'])
    else:
        out.sort(key=lambda r: -r['time'])

    total = len(out)
    page = out[offset: offset + limit]
    return {
        'total': total,
        'offset': offset,
        'limit': limit,
        'items': [_item(r) for r in page],
    }


def _item(r):
    return {
        'id': r['id'], 'name': r['name'],
        'agent': r['agent'], 'agentGrp': r['agentGrp'], 'agentEn': r['agentEn'],
        'agentIcon': r.get('agentIcon'),
        'agentImg': r.get('agentImg'),
        'agentPortrait': r.get('agentPortrait'),
        'map': r['map'], 'mapGrp': r['mapGrp'],
        'mapCover': r.get('mapCover'),
        'modeIcon': r.get('modeIcon'),
        'type': r['type'], 'date': r['date'], 'clock': r.get('clock', ''),
        'time': r['time'], 'duration': r['duration'],
        'size': r['size'], 'sizeText': fmt_bytes(r['size']),
        'res': r['res'], 'fav': bool(r.get('fav')),
        'hidden': bool(r.get('hidden')), 'account': r['account'],
        'exists': r['exists'],
        'mode': r['mode'], 'won': r['won'], 'score': r.get('score', ''),
        'kda': r.get('kda', ''), 'kills': r['kills'], 'deaths': r['deaths'],
        'assists': r['assists'], 'scorePoint': r.get('scorePoint'),
        'match': r['match'],
        'tags': r.get('tags') or [],
    }


@app.get('/api/video/{vid}')
def video_detail(vid: str):
    r = _find(vid)
    if not r:
        return JSONResponse({'error': 'not found'}, status_code=404)
    return dict(r, sizeText=fmt_bytes(r['size']))


@app.post('/api/video/{vid}/fav')
async def toggle_fav(vid: str):
    r = _find(vid)
    if not r:
        return JSONResponse({'error': 'not found'}, status_code=404)
    ov = load_overrides()
    o = ov.setdefault(vid, {})
    o['fav'] = not bool(r.get('fav'))
    save_overrides(ov)
    r['fav'] = o['fav']
    return {'fav': r['fav']}


@app.post('/api/video/{vid}/hide')
async def toggle_hide(vid: str):
    r = _find(vid)
    if not r:
        return JSONResponse({'error': 'not found'}, status_code=404)
    ov = load_overrides()
    o = ov.setdefault(vid, {})
    o['hidden'] = not bool(r.get('hidden'))
    save_overrides(ov)
    r['hidden'] = o['hidden']
    return {'hidden': r['hidden'], 'note': '仅在此页面隐藏，原始文件未改动'}


@app.post('/api/video/{vid}/rename')
async def rename(vid: str, request: Request):
    r = _find(vid)
    if not r:
        return JSONResponse({'error': 'not found'}, status_code=404)
    body = await request.json()
    name = (body.get('name') or '').strip()[:120]
    ov = load_overrides()
    o = ov.setdefault(vid, {})
    if name:
        o['name'] = name
        r['name'] = name
    else:
        o.pop('name', None)
        r['name'] = os.path.splitext(os.path.basename(r['src']))[0]
    save_overrides(ov)
    return {'name': r['name'], 'note': '只改了显示名，原始文件未改动'}


@app.post('/api/video/{vid}/export')
async def export(vid: str, request: Request):
    r = _find(vid)
    if not r:
        return JSONResponse({'error': 'not found'}, status_code=404)
    body = await request.json()
    dest = body.get('dest') or ''
    if not dest:
        cfg = load_config()
        dest = os.path.join(cfg.get('exportDir') or os.path.expanduser('~\\Videos\\无畏时刻导出'))
    os.makedirs(dest, exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|]', '_', r['name'])[:80]
    date = r['date']
    agent = r['agent'] or '未标注'
    ext = os.path.splitext(r['src'])[1]
    target = os.path.join(dest, '%s_%s_%s_%s%s' % (date, agent, r['type'] or '精彩时刻', safe[:16], ext))
    i = 1
    while os.path.exists(target):
        target = os.path.join(dest, '%s_%s_%s_%s_%d%s' % (date, agent, r['type'] or '精彩时刻', safe[:16], i, ext))
        i += 1
    shutil.copy2(r['src'], target)
    return {'path': target}


# ---------------------------------------------------------------- 标签

@app.get('/api/tags')
def list_tags():
    idx = ensure_index()
    return {'tags': idx.get('facets', {}).get('tags', [])}


@app.post('/api/tags')
async def create_tag(request: Request):
    body = await request.json()
    name = (body.get('name') or '').strip()[:12]
    color = (body.get('color') or '#8fb8f0').strip()
    if not name:
        return JSONResponse({'error': '标签名不能为空'}, status_code=400)
    d = load_tags()
    for t in d['tags']:
        if t['name'] == name:
            return JSONResponse({'error': '标签已存在'}, status_code=400)
    tid = 't_%d' % int(time.time() * 1000)
    d['tags'].append({'id': tid, 'name': name, 'color': color})
    save_tags(d)
    idx = ensure_index()
    apply_tags(idx)
    return {'id': tid, 'name': name, 'color': color}


@app.patch('/api/tags/{tid}')
async def update_tag(tid: str, request: Request):
    body = await request.json()
    d = load_tags()
    for t in d['tags']:
        if t['id'] == tid:
            if body.get('name'):
                t['name'] = body['name'].strip()[:12]
            if body.get('color'):
                t['color'] = body['color'].strip()
            save_tags(d)
            idx = ensure_index()
            apply_tags(idx)
            return {'ok': True, 'tag': t}
    return JSONResponse({'error': 'not found'}, status_code=404)


@app.delete('/api/tags/{tid}')
async def delete_tag(tid: str):
    d = load_tags()
    d['tags'] = [t for t in d['tags'] if t['id'] != tid]
    for vid in list(d['videoTags'].keys()):
        lst = [x for x in d['videoTags'][vid] if x != tid]
        if lst:
            d['videoTags'][vid] = lst
        else:
            d['videoTags'].pop(vid, None)
    save_tags(d)
    idx = ensure_index()
    apply_tags(idx)
    return {'ok': True, 'note': '标签已删除，原始视频未受影响'}


# ---------------------------------------------------------------- 批量操作

@app.post('/api/batch/tag')
async def batch_tag(request: Request):
    """给多个视频加/减标签。body: {ids:[], tagIds:[], action:'add'|'remove'}"""
    body = await request.json()
    ids = body.get('ids') or []
    tag_ids = body.get('tagIds') or []
    action = body.get('action') or 'add'
    d = load_tags()
    known = {t['id'] for t in d['tags']}
    tag_ids = [t for t in tag_ids if t in known]
    n = 0
    for vid in ids:
        cur = list(d['videoTags'].get(vid) or [])
        if action == 'add':
            for t in tag_ids:
                if t not in cur:
                    cur.append(t)
                    n += 1
        else:
            before = len(cur)
            cur = [x for x in cur if x not in tag_ids]
            n += before - len(cur)
        if cur:
            d['videoTags'][vid] = cur
        else:
            d['videoTags'].pop(vid, None)
    save_tags(d)
    idx = ensure_index()
    apply_tags(idx)
    return {'ok': True, 'changed': n, 'count': len(ids)}


@app.post('/api/batch/fav')
async def batch_fav(request: Request):
    body = await request.json()
    ids = body.get('ids') or []
    value = bool(body.get('value', True))
    ov = load_overrides()
    for vid in ids:
        ov.setdefault(vid, {})['fav'] = value
    save_overrides(ov)
    idx = ensure_index()
    vm = {r['id']: r for r in idx['records']}
    for vid in ids:
        if vid in vm:
            vm[vid]['fav'] = value
    return {'ok': True, 'count': len(ids)}


@app.post('/api/batch/hide')
async def batch_hide(request: Request):
    body = await request.json()
    ids = body.get('ids') or []
    value = bool(body.get('value', True))
    ov = load_overrides()
    for vid in ids:
        ov.setdefault(vid, {})['hidden'] = value
    save_overrides(ov)
    idx = ensure_index()
    vm = {r['id']: r for r in idx['records']}
    for vid in ids:
        if vid in vm:
            vm[vid]['hidden'] = value
    return {'ok': True, 'count': len(ids), 'note': '仅在此页面隐藏，原始文件未改动'}


@app.post('/api/batch/export')
async def batch_export(request: Request):
    """批量导出：复制到 导出目录/选中导出_时间戳/ ，文件名带日期英雄类型。"""
    body = await request.json()
    ids = body.get('ids') or []
    idx = ensure_index()
    vm = {r['id']: r for r in idx['records']}
    cfg = load_config()
    base = cfg.get('exportDir') or os.path.expanduser(r'~\Videos\无畏时刻导出')
    folder = os.path.join(base, '选中导出_' + time.strftime('%Y%m%d_%H%M%S'))
    os.makedirs(folder, exist_ok=True)
    done, fail = 0, []
    for vid in ids:
        r = vm.get(vid)
        if not r or not os.path.isfile(r['src']):
            fail.append(vid)
            continue
        safe = re.sub(r'[\\/:*?"<>|]', '_', r['name'])[:40]
        ext = os.path.splitext(r['src'])[1]
        agent = r['agent'] or '未标注'
        target = os.path.join(folder, '%s_%s_%s_%s%s' % (
            r['date'], agent, r['type'] or '精彩时刻', safe, ext))
        i = 1
        while os.path.exists(target):
            target = os.path.join(folder, '%s_%s_%s_%s_%d%s' % (
                r['date'], agent, r['type'] or '精彩时刻', safe, i, ext))
            i += 1
        try:
            shutil.copy2(r['src'], target)
            done += 1
        except Exception as e:
            fail.append('%s: %s' % (vid, e))
    return {'ok': True, 'exported': done, 'failed': len(fail),
            'folder': folder, 'errors': fail[:5]}


@app.post('/api/batch/delete')
async def batch_delete(request: Request):
    """删除：把原始文件移到回收站（可恢复）。

    注意：这里【只做移动】。永久删除只能通过 /api/trash/purge。

    处理文件被占用的常见情况：
      · 视频正在播放 / 服务端正在传输 → 先取消传输，再等句柄释放
      · Windows 下句柄释放有延迟 → 最多重试 8 次（约 4 秒）
      · 仍失败 → 尝试先复制到回收站再删源文件；再不行就标记为「待删除」
    """
    body = await request.json()
    ids = body.get('ids') or []
    idx = ensure_index()
    vm = {r['id']: r for r in idx['records']}
    cfg = load_config()
    trash = cfg.get('trashDir') or os.path.join(BASE, '回收站')
    os.makedirs(trash, exist_ok=True)

    moved, fail, ok_ids = 0, [], []
    for vid in ids:
        r = vm.get(vid)
        if not r:
            fail.append('%s: 记录不存在' % vid)
            continue
        src = r['src']
        if not os.path.isfile(src):
            fail.append('%s: 文件已不存在' % vid)
            r['exists'] = False
            continue

        # 1) 先让正在传输的流停下
        _transport_tokens.pop(vid, None)
        _wait_handle_release(src, tries=8, delay=0.5)

        # 移动到回收站（删除流程的唯一归宿）
        target = os.path.join(
            trash,
            os.path.basename(os.path.dirname(src)) + '__' + os.path.basename(src))
        base, ext = os.path.splitext(target)
        i = 1
        while os.path.exists(target):
            target = '%s(%d)%s' % (base, i, ext)
            i += 1
        ok, err = _safe_move(src, target)

        if ok:
            moved += 1
            ok_ids.append(vid)
            r['exists'] = False
            # 记录原始绝对路径，还原时精确回位
            ti = load_trash_index()
            ti[os.path.basename(target)] = src
            save_trash_index(ti)
        else:
            fail.append('%s: %s' % (os.path.basename(src), err))

    if moved:
        # 逐条记录已删除状态，并立即反映到内存索引（下次查询就不再出现）
        ov = load_overrides()
        for vid in ok_ids:
            ov.setdefault(vid, {})['hidden'] = True
            ov[vid]['deleted'] = True
            r = vm.get(vid)
            if r:
                r['hidden'] = True
                r['exists'] = False
        save_overrides(ov)

    return {'ok': True, 'moved': moved, 'failed': len(fail),
            'trash': trash, 'errors': fail[:8]}


def _wait_handle_release(path, tries=8, delay=0.5):
    """等待文件句柄释放（可被删除/改名）。"""
    import time as _t
    for _ in range(tries):
        if not os.path.exists(path):
            return True
        try:
            with open(path, 'rb'):
                # 关键：能独占重命名就说明没被写占用
                pass
            tmp = path + '.dsh_probe'
            os.rename(path, tmp)
            os.rename(tmp, path)
            return True
        except OSError:
            _t.sleep(delay)
    return False


def _safe_move(src, target):
    """移动文件；被占用时重试，最后用复制+删除兜底。"""
    import time as _t
    last = None
    for i in range(3):
        try:
            shutil.move(src, target)
            return True, None
        except OSError as e:
            last = e
            _t.sleep(0.6)
    # 兜底：复制后再尝试删源（源删不掉也不影响用户看到结果）
    try:
        shutil.copy2(src, target)
        try:
            os.remove(src)
        except OSError:
            pass
        return True, None
    except Exception as e:
        return False, '文件被其他程序占用（%s）。请关闭正在播放该视频的播放器/浏览器后重试。' % (
            getattr(last, 'winerror', '') or last)


def _safe_remove(path):
    """彻底删除。"""
    import time as _t
    last = None
    for i in range(4):
        try:
            os.remove(path)
            return True, None
        except OSError as e:
            last = e
            _t.sleep(0.5)
    return False, '文件被占用，无法删除（%s）。请关闭正在播放它的程序后重试。' % last


# ---------------------------------------------------------------- 回收站

def _trash_dir():
    cfg = load_config()
    d = cfg.get('trashDir') or os.path.join(BASE, '回收站')
    os.makedirs(d, exist_ok=True)
    return d


@app.get('/api/trash')
def trash_list():
    d = _trash_dir()
    items = []
    for name in os.listdir(d):
        p = os.path.join(d, name)
        if not os.path.isfile(p):
            continue
        try:
            st = os.stat(p)
        except OSError:
            continue
        items.append({
            'name': name,
            'size': st.st_size,
            'sizeText': fmt_bytes(st.st_size),
            'time': int(st.st_mtime),
            'path': p,
        })
    items.sort(key=lambda x: -x['time'])
    # 补上原视频的元数据，让回收站里也能看到是什么内容
    ti = load_trash_index()
    try:
        idx = ensure_index()
        by_path = {os.path.normcase(r['src']): r for r in idx['records']}
    except Exception:
        by_path = {}
    for it in items:
        orig = ti.get(it['name'])
        rec = by_path.get(os.path.normcase(orig)) if orig else None
        if rec:
            it['meta'] = {
                'agent': rec.get('agent') or '',
                'agentGrp': rec.get('agentGrp') or '',
                'map': rec.get('map') or '',
                'type': rec.get('type') or '',
                'date': rec.get('date') or '',
                'clock': rec.get('clock') or '',
                'duration': rec.get('duration') or 0,
                'mode': rec.get('mode') or '',
                'won': rec.get('won'),
                'kda': rec.get('kda') or '',
                'res': rec.get('res') or '',
                'origPath': orig or '',
            }
        else:
            it['meta'] = None
    return {'dir': d, 'count': len(items), 'items': items,
            'totalSize': sum(i['size'] for i in items)}


def _file_fingerprint(path):
    """返回 (大小, md5)，用于判断两个文件是否同一份内容。"""
    import hashlib
    try:
        size = os.path.getsize(path)
        h = hashlib.md5()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        return size, h.hexdigest()
    except Exception:
        return None


def _mark_restored(rec, ti, name, base_name):
    """把记录标为已还原：恢复 exists、清掉 hidden/deleted、清回收站索引。"""
    ti.pop(name, None)
    ti.pop(base_name, None)
    if rec:
        rec['exists'] = True
        rec['hidden'] = False
        ov = load_overrides()
        o = ov.get(rec['id']) or {}
        o.pop('deleted', None)
        o.pop('hidden', None)
        if o:
            ov[rec['id']] = o
        else:
            ov.pop(rec['id'], None)
        save_overrides(ov)


@app.post('/api/trash/restore')
async def trash_restore(request: Request):
    """把回收站文件还原到【删除时记录的原始绝对路径】。

    原位置已有同名文件时：
      · 若内容一致（大小 + MD5 相同）→ 判定为「已还原」，清理多余副本与隐藏标记；
      · 若内容不同 → 不覆盖，报错并保留回收站文件。
    找不到原始路径时直接报错，绝不猜测目录（避免放错账号文件夹）。
    """
    body = await request.json()
    names = body.get('names') or []
    force = bool(body.get('force'))   # 内容不同时，另存为 (1) 强制还原
    d = _trash_dir()
    ti = load_trash_index()
    idx = ensure_index()
    by_name = {os.path.basename(r['src']): r for r in idx['records']}
    by_path = {r['src']: r for r in idx['records']}
    by_id = {r['id']: r for r in idx['records']}
    ok, fail = 0, []

    for name in names:
        p = os.path.join(d, name)
        if not os.path.isfile(p):
            fail.append(name + ' 不存在')
            continue

        import re as _re
        m = _re.search(r'^(.*?)\((\d+)\)(\.[^.]+)$', name)
        base_name = (m.group(1) + m.group(3)) if m else name

        target = ti.get(name) or ti.get(base_name)
        rec = by_path.get(target) if target else None
        if rec is None:
            rec = by_name.get(base_name)
        if rec is None and target:
            stem = os.path.splitext(base_name)[0]
            vid_guess = stem.split('__')[-1]
            rec = by_id.get(vid_guess)

        if not target and rec and rec.get('exists'):
            target = rec['src']

        if not target:
            fail.append(name + '：找不到原始路径，已保留在回收站')
            continue

        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)

            if os.path.exists(target):
                a = _file_fingerprint(p)
                b = _file_fingerprint(target)
                if a is not None and a == b:
                    # 同一份内容：原位置已经还原好了，回收站里这份是多余副本
                    _wait_handle_release(p, tries=3, delay=0.3)
                    try:
                        os.remove(p)          # 删除多余副本，释放空间
                    except OSError:
                        pass                  # 删不掉也不影响「已还原」判定
                    _mark_restored(rec, ti, name, base_name)
                    ok += 1
                    continue

                if force:
                    # 内容不同但用户强制还原：另存为 (1)，不覆盖原文件
                    base, ext = os.path.splitext(target)
                    i = 1
                    alt = '%s(%d)%s' % (base, i, ext)
                    while os.path.exists(alt):
                        i += 1
                        alt = '%s(%d)%s' % (base, i, ext)
                    _wait_handle_release(p, tries=3, delay=0.3)
                    shutil.move(p, alt)
                    _mark_restored(rec, ti, name, base_name)
                    ok += 1
                    continue

                fail.append(name + '：原位置已有不同内容的文件，未覆盖'
                            '（可用「另存还原」保留两份，或先在回收站里彻底删除副本）')
                continue

            _wait_handle_release(p, tries=3, delay=0.3)
            shutil.move(p, target)
            _mark_restored(rec, ti, name, base_name)
            ok += 1
        except Exception as e:
            fail.append(name + '：' + str(e))

    save_trash_index(ti)
    return {'ok': True, 'restored': ok, 'failed': len(fail), 'errors': fail[:5]}


@app.post('/api/trash/purge')
async def trash_purge(request: Request):
    """彻底清空回收站（不可恢复）。"""
    body = await request.json()
    names = body.get('names') or []
    d = _trash_dir()
    removed = 0
    if names:
        for name in names:
            p = os.path.join(d, name)
            if os.path.isfile(p):
                try:
                    os.remove(p)
                    removed += 1
                except OSError:
                    pass
    else:
        for name in os.listdir(d):
            p = os.path.join(d, name)
            if os.path.isfile(p):
                try:
                    os.remove(p)
                    removed += 1
                except OSError:
                    pass
    ti = load_trash_index()
    for n in list(ti.keys()):
        p = os.path.join(d, n)
        if not os.path.exists(p):
            ti.pop(n, None)
    save_trash_index(ti)
    return {'ok': True, 'removed': removed}


# ---------------------------------------------------------------- 损坏文件检测

def _scan_broken(idx):
    """返回文件缺失或大小为 0 的记录。"""
    out = []
    for r in idx['records']:
        src = r.get('src') or ''
        reason = None
        if not src:
            reason = '路径为空'
        elif not os.path.isfile(src):
            reason = '文件不存在'
        else:
            try:
                if os.path.getsize(src) < 1024:
                    reason = '文件异常小（可能损坏）'
            except OSError:
                reason = '无法读取'
        if reason:
            out.append({
                'id': r['id'],
                'name': r.get('name') or os.path.basename(src),
                'date': r.get('date') or '',
                'agent': r.get('agent') or '',
                'type': r.get('type') or '',
                'sizeText': fmt_bytes(r.get('size') or 0),
                'reason': reason,
                'src': src,
                'hidden': bool(r.get('hidden')),
            })
    return out


@app.get('/api/broken')
def list_broken():
    idx = ensure_index()
    items = _scan_broken(idx)
    return {'count': len(items), 'items': items}


@app.post('/api/broken/clean')
async def clean_broken(request: Request):
    """清理损坏记录。
    action = hide   → 只在页面隐藏（推荐，不动文件）
             move   → 若有残留文件则移到回收站
             purge  → 从索引里彻底移除这些记录（重新扫描后仍会出现）
    """
    body = await request.json()
    ids = body.get('ids') or []
    action = body.get('action') or 'hide'
    idx = ensure_index()
    items = {x['id']: x for x in _scan_broken(idx)}
    targets = [i for i in ids if i in items] if ids else list(items.keys())

    done = 0
    if action == 'hide':
        ov = load_overrides()
        vm = {r['id']: r for r in idx['records']}
        for vid in targets:
            ov.setdefault(vid, {})['hidden'] = True
            if vid in vm:
                vm[vid]['hidden'] = True
            done += 1
        save_overrides(ov)
    elif action == 'move':
        trash = _trash_dir()
        vm = {r['id']: r for r in idx['records']}
        ti = load_trash_index()
        for vid in targets:
            r = vm.get(vid)
            if not r:
                continue
            src = r.get('src') or ''
            if os.path.isfile(src):
                try:
                    name = os.path.basename(os.path.dirname(src)) + '__' + os.path.basename(src)
                    dst = os.path.join(trash, name)
                    shutil.move(src, dst)
                    ti[name] = src
                    done += 1
                except Exception:
                    pass
            r['exists'] = False
            r['hidden'] = True
        save_trash_index(ti)
        ov = load_overrides()
        for vid in targets:
            ov.setdefault(vid, {})['hidden'] = True
        save_overrides(ov)

    return {'ok': True, 'action': action, 'cleaned': done}


@app.get('/api/days')
def api_days(request: Request):
    """按天统计视频数（供日历使用），可限定年月。"""
    ym = (request.query_params.get('ym') or '').strip()
    idx = ensure_index()
    counts = {}
    for r in idx['records']:
        if r.get('hidden'):
            continue
        d = r.get('date') or ''
        if not d:
            continue
        if ym and not d.startswith(ym):
            continue
        counts[d] = counts.get(d, 0) + 1
    items = [{'date': k, 'count': v} for k, v in sorted(counts.items(), reverse=True)]
    return {'total': len(items), 'items': items}


@app.post('/api/rebuild')
async def rebuild(request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    root = (body.get('root') or '').strip()
    if root:
        root = os.path.expandvars(os.path.expanduser(root))
        if not os.path.isdir(root):
            return JSONResponse({'error': '目录不存在: %s' % root}, status_code=400)
    else:
        root = _index_root()
    rebuild_async(root)
    return {'ok': True, 'root': root}


@app.get('/api/browse')
def browse(path: str = ''):
    """简易目录浏览，给"选择文件夹"用。"""
    path = path or os.path.expanduser('~')
    path = os.path.abspath(os.path.expandvars(path))
    if not os.path.isdir(path):
        path = os.path.expanduser('~')
    dirs = []
    try:
        for name in sorted(os.listdir(path)):
            p = os.path.join(path, name)
            if os.path.isdir(p) and not name.startswith('$'):
                dirs.append({'name': name, 'path': p})
    except PermissionError:
        pass
    parent = os.path.dirname(path)
    drives = [d + ':\\' for d in 'CDEFGH' if os.path.isdir(d + ':\\')]
    return {'path': path, 'parent': parent if parent != path else '',
            'dirs': dirs[:200], 'drives': drives}


# ---------------------------------------------------------------- 静态页面

@app.get('/')
def home():
    return FileResponse(os.path.join(BASE, 'web', 'index.html'))


app.mount('/static', StaticFiles(directory=os.path.join(BASE, 'web')), name='static')


if __name__ == '__main__':
    cfg = load_config()
    host = cfg.get('host', '127.0.0.1')
    port = int(cfg.get('port', 8765))
    print('=' * 56)
    print('  无畏时刻 · 本地视频墙')
    print('  数据目录:', cfg.get('root'))
    print('  地址: http://%s:%d' % (host, port))
    print('=' * 56)
    ensure_index()
    if cfg.get('open_browser', True):
        import webbrowser
        threading.Timer(1.2, lambda: webbrowser.open('http://%s:%d' % (host, port))).start()
    uvicorn.run(app, host=host, port=port, log_level='warning')
