#!/usr/bin/env python3
# Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
"""Harness-independent, per-user prompt service. Single daemon, transactional SQLite."""
import hashlib
from contextlib import contextmanager
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid
import sys

class Conflict(ValueError):pass

class Library:
    def __init__(self,path):
        self.path=path
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS library (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
                INSERT OR IGNORE INTO library VALUES (1,0);
                CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, content TEXT NOT NULL, revision INTEGER NOT NULL, updatedAt TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS imports (source TEXT NOT NULL, sourceId TEXT NOT NULL, digest TEXT NOT NULL, promptId TEXT NOT NULL, PRIMARY KEY(source,sourceId,digest));
                CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
            ''')
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA synchronous=FULL')
        try:
            with db:yield db
        finally:db.close()
    def snapshot(self,db):
        return {'revision':db.execute('SELECT revision FROM library').fetchone()[0],
                'prompts':[dict(r) for r in db.execute('SELECT * FROM prompts ORDER BY name COLLATE NOCASE')]}
    def bump(self,db):
        db.execute('UPDATE library SET revision=revision+1');return db.execute('SELECT revision FROM library').fetchone()[0]
    def valid(self,p):
        name=p.get('name');content=p.get('content')
        if not isinstance(name,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}',name):raise ValueError('Use letters, numbers, - or _ for the shortcut name.')
        if not isinstance(content,str) or not content.strip() or len(content)>32000:raise ValueError('Enter prompt text up to 32,000 characters.')
        return name,content
    def save(self,db,p):
        name,content=self.valid(p)
        identity=p.get('promptId') or p.get('id');original=p.get('original') or (name if p.get('expectedRevision') is not None and not identity else None)
        old=db.execute('SELECT * FROM prompts WHERE id=?',(identity,)).fetchone() if identity else db.execute('SELECT * FROM prompts WHERE name=?',(original,)).fetchone() if original else None
        if (identity or original) and not old:raise Conflict('This prompt was deleted or renamed. Your draft is unchanged; reload or save it as a new prompt.')
        if old and old['revision']!=p.get('expectedRevision'):raise Conflict('This prompt changed elsewhere. Your draft is unchanged; reload or save it as a new prompt.')
        if db.execute('SELECT id FROM prompts WHERE name=? AND id<>?',(name,old['id'] if old else '')).fetchone():raise Conflict('That shortcut name already exists. Choose another name.')
        if not old and db.execute('SELECT count(*) FROM prompts').fetchone()[0]>=1000:raise ValueError('The library is limited to 1,000 prompts.')
        if db.execute('SELECT coalesce(sum(length(cast(content AS BLOB))),0) FROM prompts').fetchone()[0]-len((old['content'] if old else '').encode())+len(content.encode())>500000:raise ValueError('The library text limit is 500,000 UTF-8 bytes.')
        revision=self.bump(db);identity=old['id'] if old else str(uuid.uuid4())
        db.execute('INSERT INTO prompts VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,content=excluded.content,revision=excluded.revision,updatedAt=excluded.updatedAt',
                   (identity,name,content,revision,time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())))
        return identity
    def mutate(self,db,method,p):
        if method=='prompts.save':self.save(db,p)
        elif method=='prompts.delete':
            identity=p.get('promptId') or p.get('id')
            old=db.execute('SELECT * FROM prompts WHERE id=?',(identity,)).fetchone() if identity else db.execute('SELECT * FROM prompts WHERE name=?',(p.get('name'),)).fetchone()
            if not old or old['revision']!=p.get('expectedRevision'):raise Conflict('This prompt changed or was deleted elsewhere. Reload before deleting.')
            db.execute('DELETE FROM prompts WHERE id=?',(old['id'],));self.bump(db)
        elif method=='prompts.import':
            source=p.get('source');rows=p.get('prompts')
            if not isinstance(source,str) or len(source)>300 or not isinstance(rows,list) or len(rows)>1000:raise ValueError('Invalid import')
            for row in rows:
                name,content=self.valid(row);source_id=str(row.get('id',name));digest=hashlib.sha256(content.encode()).hexdigest()
                if db.execute('SELECT 1 FROM imports WHERE source=? AND sourceId=? AND digest=?',(source,source_id,digest)).fetchone():continue
                same=db.execute('SELECT id FROM prompts WHERE name=? AND content=?',(name,content)).fetchone()
                if same:identity=same['id']
                else:
                    base=name;number=1
                    while db.execute('SELECT 1 FROM prompts WHERE name=?',(name,)).fetchone():
                        number+=1;name=base[:105]+'-imported-'+str(number)
                    identity=self.save(db,{'name':name,'content':content})
                db.execute('INSERT INTO imports VALUES (?,?,?,?)',(source,source_id,digest,identity))
        else:raise ValueError('Unsupported prompt operation')
        return self.snapshot(db)
    def call(self,method,p,request_id):
        with self.connect() as db:
            if method == 'prompts.list':
                db.execute('BEGIN')
                result=self.snapshot(db)
                return result
            digest=hashlib.sha256(json.dumps([method,p],sort_keys=True).encode()).hexdigest()
            db.execute('BEGIN IMMEDIATE')
            existing=db.execute('SELECT * FROM requests WHERE id=?',(request_id,)).fetchone()
            if existing:
                if existing['digest']!=digest:raise Conflict('Request ID reused with different data.')
                return json.loads(existing['result'])
            result=self.mutate(db,method,p)
            db.execute('INSERT INTO requests VALUES (?,?,?)',(request_id,digest,json.dumps(result)))
            # Keep acknowledgements small: duplicates return the committed result
            # for the latest 256 writes; clients never auto-replay unknown writes.
            db.execute('DELETE FROM requests WHERE rowid NOT IN (SELECT rowid FROM requests ORDER BY rowid DESC LIMIT 256)')
            db.commit()
        return result


# One invocation handles one request; no daemon, timer, model or background worker.
if __name__ == '__main__':
    import os
    os.umask(0o077)
    try:
        raw=sys.stdin.buffer.read(1024*1024+1)
        if len(raw)>1024*1024:raise ValueError('Request too large')
        request=json.loads(raw)
        path=Path(sys.argv[1]);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        result=Library(path).call(request['method'],request.get('params',{}),request['id'])
        print(json.dumps({'result':result},ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':{'message':str(error)}}))
