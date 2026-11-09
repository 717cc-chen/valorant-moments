# -*- coding: utf-8 -*-
"""英雄、地图、游戏模式的 ID -> 中文名映射 + 官方图片地址。

数据来源（均为客户端里的官方值）：
  · 地图：ACLOS 日志官方接口 data.maps_all（highlight_e_name -> 中文名 + icon）
  · 英雄：ACLOS 日志 agent_id/agent_name_en（7=Sage, 8=Sova, 9=Viper...）
          + 逐个下载 headicon/01~30.png 并用视觉核对，得到完整编号表
  · 图片 CDN：https://game.gtimg.cn/images/val/agamezlk/
        headicon/NN.png   100x100 英雄头像（带透明通道）
        portrait/NN.png   326x500 英雄立绘
        map/<name>/cover.PNG      1920x1080 地图封面
        gamemode/<mode>.png       游戏模式图标
"""

IMG_BASE = 'https://game.gtimg.cn/images/val/agamezlk'

# ---------------------------------------------------------------- 英雄
# 英文 agent_name -> (中文官方名, 排序键, headicon 编号)
# 编号已通过下载 headicon/01~30.png 逐个视觉核对
AGENTS = {
    'Breach': ('铁臂', 'breach', 1),   # 内部代号 Breach
    'Jett': ('婕风', 'jett', 2),   # 内部代号 Wushu
    'Raze': ('雷兹', 'raze', 3),   # 内部代号 Clay
    'Omen': ('幽影', 'omen', 4),   # 内部代号 Wraith
    'Brimstone': ('炼狱', 'brimstone', 5),   # 内部代号 Sarge
    'Phoenix': ('不死鸟', 'phoenix', 6),   # 内部代号 Phoenix
    'Sage': ('贤者', 'sage', 7),   # 内部代号 Thorne
    'Sova': ('猎枭', 'sova', 8),   # 内部代号 Hunter
    'Viper': ('蝰蛇', 'viper', 9),   # 内部代号 Pandemic
    'Cypher': ('零', 'cypher', 10),   # 内部代号 Gumshoe
    'Reyna': ('芮娜', 'reyna', 11),   # 内部代号 Vampire
    'Killjoy': ('奇乐', 'killjoy', 12),   # 内部代号 Killjoy
    'Skye': ('斯凯', 'skye', 13),   # 内部代号 Guide
    'Yoru': ('夜露', 'yoru', 14),   # 内部代号 Stealth
    'Astra': ('星礈', 'astra', 15),   # 内部代号 Rift
    'KAY/O': ('K/O', 'kayo', 16),   # 内部代号 Grenadier
    'KAYO': ('K/O', 'kayo', 16),   # 内部代号 Grenadier
    'Chamber': ('尚勃勒', 'chamber', 17),   # 内部代号 Deadeye
    'Neon': ('霓虹', 'neon', 18),   # 内部代号 Sprinter
    'Fade': ('黑梦', 'fade', 19),   # 内部代号 BountyHunter
    'Harbor': ('海神', 'harbor', 20),   # 内部代号 Mage
    'Gekko': ('盖可', 'gekko', 21),   # 内部代号 AggroBot
    'Deadlock': ('钢锁', 'deadlock', 22),   # 内部代号 Cable
    'Iso': ('壹决', 'iso', 23),   # 内部代号 Sequoia
    'Clove': ('暮蝶', 'clove', 24),   # 内部代号 Smonk
    'Vyse': ('维斯', 'vyse', 25),   # 内部代号 Nox
    'Tejo': ('钛狐', 'tejo', 26),   # 内部代号 Cashew
    'Waylay': ('幻棱', 'waylay', 27),   # 内部代号 Terra
    'Veto': ('禁灭', 'veto', 28),   # 内部代号 Pine（黑人男性）
    'Miks': ('迷核', 'miks', 29),   # 内部代号 Iris
    'Hush': ('遐思', 'hush', 30),   # 内部代号 Paprika（粉紫长发）
}

# ---------------------------------------------------------------- 地图
# highlight_e_name（小写）-> (官方中文名, CDN 目录名)
MAPS = {
    'duality': ('源工重镇', 'bind'),
    'triad': ('隐世修所', 'haven'),
    'bonsai': ('霓虹町', 'split'),
    'ascent': ('亚海悬城', 'ascent'),
    'port': ('森寒冬港', 'icebox'),
    'foxtrot': ('微风岛屿', 'breeze'),
    'canyon': ('裂变峡谷', 'fracture'),
    'pitt': ('深海明珠', 'pearl'),
    'jam': ('莲华古城', 'lotus'),
    'hurm_yard': ('小镇', ''),
    'hurm_alley': ('商街', ''),
    'hurm_bowl': ('古城', ''),
    'juliett': ('日落之城', 'sunset'),
    'hurm_helix': ('渔市', 'drift'),
    'infinity': ('幽邃地窟', 'abyss'),
    'hurm_highTide': ('乱次元', 'glitch'),
    'hurm_hightide': ('乱次元', 'glitch'),
    'rook': ('盐海矿镇', ''),
    'plummet': ('天枢云阙', ''),
    # 非标准对局
    'rangev2': ('射击场', ''),
    'range': ('射击场', ''),
    'skirmish_a': ('遭遇战', ''),
    'skirmish_b': ('遭遇战', ''),
    'duel_1': ('遭遇战', ''),
    'duel_2': ('遭遇战', ''),
}

MODES = {
    '竞技模式': 'competitive',
    '普通模式': 'unrated',
    '极速模式': 'swiftplay',
    '爆能快攻': '',
    '团队乱斗': '',
    '个人乱斗': '',
    '乱斗模式': '',
    '武装升级': '',
    '雪球大战': '',
    '回防模式': '',
    '夺还模式': '',
    '爆能大乱斗': '',
    '基础训练': '',
    '战技测试': '',
    '射击场': '',
    '遭遇战': '',
}

VIDEO_TYPE_ORDER = ['击杀集锦', '死亡集锦', '三杀时刻', '四杀时刻', '五杀时刻',
                    '战技测试', '进阶剪辑', '段位晋级', '夜市翻牌']

_MODE_KEYS = [
    ('/gamemodes/bomb/competitive', '竞技模式'),
    ('/gamemodes/bomb/unrated', '普通模式'),
    ('/gamemodes/swiftplay', '极速模式'),
    ('/gamemodes/spikerush', '爆能快攻'),
    ('/gamemodes/deathmatch', '死斗模式'),
    ('/gamemodes/teamdeathmatch', '团队乱斗'),
    ('/gamemodes/ggteam', '武装升级'),
    ('/gamemodes/hurm', '团队乱斗'),
    ('/gamemodes/snowball', '雪球大战'),
    ('/gamemodes/oneforall', '全员一心'),
    ('/gamemodes/retakematch', '回防模式'),
    ('/gamemodes/duel', '遭遇战'),
    ('/gamemodes/skirmish', '遭遇战'),
    ('/gamemodes/practice', '基础训练'),
    ('/gamemodes/shootingrange', '射击场'),
    ('/gamemodes/training', '基础训练'),
]

# ---------------------------------------------------------------- 图片地址

def _icon_of(name):
    """按中文名或英文名查 headicon 编号。"""
    if not name:
        return None
    info = AGENTS.get(name)
    if info and info[2]:
        return info[2]
    for en, (cn, key, icon) in AGENTS.items():
        if cn == name and icon:
            return icon
    return None


def agent_icon_url(name):
    """英雄头像（headicon/NN.png），支持中文名或英文名。"""
    icon = _icon_of(name)
    if not icon:
        return None
    return '%s/headicon/%02d.png' % (IMG_BASE, icon)


def agent_portrait_url(name):
    """英雄大立绘（portrait/NN.png）。"""
    icon = _icon_of(name)
    if not icon:
        return None
    return '%s/portrait/%02d.png' % (IMG_BASE, icon)


def map_cover_url(map_id, map_name=''):
    """地图封面（map/<dir>/cover.PNG），没有目录名返回 None。"""
    key = map_key(map_id, map_name)
    info = MAPS.get(key)
    if not info or not info[1]:
        return None
    return '%s/map/%s/cover.PNG' % (IMG_BASE, info[1])


def mode_icon_url(mode_cn):
    """模式图标（gamemode/<key>.png），没有图标返回 None。"""
    key = MODES.get(mode_cn or '')
    if not key:
        return None
    return '%s/gamemode/%s.png' % (IMG_BASE, key)


# ---------------------------------------------------------------- 名称解析

def agent_cn(name):
    if not name:
        return ''
    info = AGENTS.get(name)
    return info[0] if info else name


def agent_key(name):
    info = AGENTS.get(name or '')
    return info[1] if info else (name or '').lower()


def agent_icon_id(name):
    info = AGENTS.get(name or '')
    return info[2] if info else None


def map_cn(map_id, map_name=''):
    if map_name:
        return map_name
    if not map_id:
        return ''
    seg = map_id.strip('/').split('/')[-1]
    info = MAPS.get(seg.lower())
    if info:
        return info[0]
    parts = [p for p in map_id.strip('/').split('/') if p]
    for part in reversed(parts):
        info = MAPS.get(part.lower())
        if info:
            return info[0]
    return seg


def map_key(map_id, map_name=''):
    if not map_id:
        return (map_name or '').lower()
    seg = map_id.strip('/').split('/')[-1]
    if seg.lower() in MAPS:
        return seg.lower()
    parts = [p for p in map_id.strip('/').split('/') if p]
    for part in reversed(parts):
        if part.lower() in MAPS:
            return part.lower()
    return seg.lower()


def mode_cn(mode_name, short_mode=''):
    hay = (mode_name or '').lower().replace('\\', '/')
    if not hay:
        return ''
    for k, v in _MODE_KEYS:
        if hay.startswith(k) or ('/' + k.lstrip('/')) in hay:
            return v
    for key, v in (('gungame', '武装升级'), ('ggteam', '武装升级'),
                   ('/gamemodes/bomb/bombgamemode', '普通模式'),
                   ('/gamemodes/bomb', '普通模式'),
                   ('competitive', '竞技模式'), ('swiftplay', '极速模式'),
                   ('unrated', '普通模式'), ('deathmatch', '乱斗模式'),
                   ('spikerush', '爆能快攻'), ('oneforall', '全员一心'),
                   ('skirmish', '遭遇战'), ('premier', '冠军之旅'),
                   ('snowball', '雪球大战'), ('range', '射击场'),
                   ('training', '训练场')):
        if key in hay:
            return v
    return ''


def all_agents():
    items, seen = [], set()
    for en, (cn, key, icon) in AGENTS.items():
        if key in seen:
            continue
        seen.add(key)
        items.append({'en': en, 'cn': cn, 'key': key, 'icon': icon})
    items.sort(key=lambda x: x['cn'])
    return items


def all_maps():
    items = [{'key': k, 'cn': v[0], 'cdn': v[1]} for k, v in MAPS.items()]
    items.sort(key=lambda x: x['cn'])
    return items
