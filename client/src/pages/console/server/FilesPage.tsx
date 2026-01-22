import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { getServer, Server, FileEntry, SearchResult, getDownloadUrl } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/utils';
import { useFileManager } from '../../../hooks/useFileManager';
import { useServerPermissions } from '../../../hooks/useServerPermissions';
import { UploadModal, FileContextMenu, SearchContextMenu, CreateFolderModal, CreateFileModal, MoveFileModal, RenameFileModal, CompressFileModal, ClipboardPanel, Button, Icons, Checkbox, PermissionDenied, Input, DeleteFileModal } from '../../../components';

const getFileIconColor = (name: string, isDir: boolean): string => {
  if (isDir) return 'text-amber-500';
  if (['tar', 'gz', 'zip', 'rar', '7z', 'bz2'].some(e => name.toLowerCase().includes(e))) return 'text-orange-500';
  if (['json', 'yaml', 'yml', 'xml', 'toml'].includes(name.split('.').pop()?.toLowerCase() || '')) return 'text-emerald-600';
  return 'text-neutral-500';
};

const FileIcon = ({ name, is_dir }: { name: string; is_dir: boolean }) => {
  const color = getFileIconColor(name, is_dir);
  if (is_dir) return <Icons.folder className={`w-5 h-5 ${color}`} />;
  if (['tar', 'gz', 'zip', 'rar', '7z', 'bz2'].some(e => name.toLowerCase().includes(e))) return <Icons.archive className={`w-5 h-5 ${color}`} />;
  if (['json', 'yaml', 'yml', 'xml', 'toml'].includes(name.split('.').pop()?.toLowerCase() || '')) return <Icons.fileText className={`w-5 h-5 ${color}`} />;
  return <Icons.file className={`w-5 h-5 ${color}`} />;
};

const isArchive = (name: string) => /\.(zip|tar|tar\.gz|tgz)$/i.test(name);

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [server, setServer] = useState<Server | null>(null);
  const fm = useFileManager(id, searchParams.get('path') || '/');
  const { can, loading: permsLoading } = useServerPermissions(id);

  const [modals, setModals] = useState<{ newFolder: boolean; newFile: boolean; upload: boolean; bulkCompress: boolean; initialFiles: FileList | null }>({ newFolder: false, newFile: false, upload: false, bulkCompress: false, initialFiles: null });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; openUp: boolean; file: FileEntry } | null>(null);
  const [searchContextMenu, setSearchContextMenu] = useState<{ x: number; y: number; openUp: boolean; result: SearchResult } | null>(null);
  const [fileTarget, setFileTarget] = useState<{ type: 'move' | 'rename' | 'compress'; file: FileEntry } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ file: FileEntry } | { bulk: true } | null>(null);

  useEffect(() => { id && getServer(id).then(res => res.success && res.data && setServer(res.data)); }, [id]);
  useEffect(() => { if (!contextMenu && !searchContextMenu) return; const h = () => { setContextMenu(null); setSearchContextMenu(null); }; document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [contextMenu, searchContextMenu]);

  if (permsLoading) return null;
  if (!can('file.list')) return <PermissionDenied message="You don't have permission to view files" />;

  const openContextMenu = (e: React.MouseEvent<HTMLButtonElement>, file: FileEntry) => {
    e.stopPropagation();
    if (file.name === '..') return;
    if (contextMenu?.file === file) { setContextMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuH = file.is_dir ? 152 : (isArchive(file.name) ? 340 : 304);
    const openUp = window.innerHeight - rect.bottom < menuH && rect.top > window.innerHeight - rect.bottom;
    setContextMenu({ x: rect.right - 48, y: openUp ? rect.top : rect.bottom + 4, openUp, file });
  };

  const openSearchContextMenu = (e: React.MouseEvent<HTMLButtonElement>, result: SearchResult) => {
    e.stopPropagation();
    if (searchContextMenu?.result === result) { setSearchContextMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const openUp = window.innerHeight - rect.bottom < 40 && rect.top > window.innerHeight - rect.bottom;
    setSearchContextMenu({ x: rect.right - 48, y: openUp ? rect.top : rect.bottom + 4, openUp, result });
  };

  const handleDownload = (file: FileEntry) => {
    if (!id) return;
    const a = document.createElement('a');
    a.href = getDownloadUrl(id, fm.getFilePath(file.name));
    a.download = file.name;
    a.click();
    setContextMenu(null);
  };

  return (
    <div className="space-y-4">
      {fm.error && <PermissionDenied message={fm.error} />}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-100">Files</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={fm.goUp} disabled={fm.currentPath === '/'}><Icons.arrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" onClick={fm.refreshFiles}><Icons.refresh className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-neutral-400 overflow-x-auto pb-1">
          <button type="button" className="hover:text-neutral-200 shrink-0" onClick={() => fm.setCurrentPath('/')}>{server?.name || 'Server'}</button>
          <span>/</span>
          <button type="button" className="hover:text-neutral-200 shrink-0" onClick={() => fm.setCurrentPath('/')}>files</button>
          {fm.currentPath !== '/' && fm.currentPath.split('/').filter(Boolean).map((part, i, arr) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <span>/</span>
              <button type="button" className="hover:text-neutral-200" onClick={() => fm.setCurrentPath('/' + arr.slice(0, i + 1).join('/'))}>{part}</button>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input className="w-full sm:flex-1" placeholder="Search files..." value={fm.search} onChange={e => fm.setSearch(e.target.value)} />
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {can('file.create') && <Button variant="ghost" onClick={() => setModals(m => ({ ...m, newFolder: true }))} className="shrink-0"><Icons.folderPlus className="h-4 w-4" /></Button>}
            {can('file.create') && <Button variant="ghost" onClick={() => setModals(m => ({ ...m, newFile: true }))} className="shrink-0"><Icons.filePlus className="h-4 w-4" /></Button>}
            <input ref={fm.uploadInputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) setModals(m => ({ ...m, upload: true, initialFiles: e.target.files })); }} />
            {can('file.upload') && <Button onClick={() => fm.uploadInputRef.current?.click()} className="shrink-0"><Icons.arrowUp className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Upload</span></Button>}
            
            
            {can('file.copy') && fm.clipboard.length > 0 && 
              <Button onClick={fm.actions.paste} 
                      disabled={!!fm.pasting} 
                      loading={!!fm.pasting} 
                      className="shrink-0">
                <Icons.clipboardCheck className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{fm.pasting ? 'Pasting...' : 'Paste'}</span>
              </Button>
            }
          </div>
        </div>
      </div>

      
      <div className="bg-neutral-900/40 rounded-lg border border-neutral-800 overflow-hidden">
        {/* Table & mobile views */}
        
      </div>

      <CreateFolderModal open={modals.newFolder} onClose={() => setModals(m => ({ ...m, newFolder: false }))} onCreate={async n => { await fm.actions.createFolder(n); setModals(m => ({ ...m, newFolder: false })); }} />
      <CreateFileModal open={modals.newFile} onClose={() => setModals(m => ({ ...m, newFile: false }))} onCreate={async n => { await fm.actions.createFile(n); setModals(m => ({ ...m, newFile: false })); }} />
      <UploadModal open={modals.upload} onClose={() => { setModals(m => ({ ...m, upload: false, initialFiles: null })); if (fm.uploadInputRef.current) fm.uploadInputRef.current.value = ''; }} serverId={id || ''} path={fm.currentPath} onComplete={fm.refreshFiles} initialFiles={modals.initialFiles} />
      <MoveFileModal open={fileTarget?.type === 'move'} initialPath={fileTarget?.type === 'move' ? fm.getFilePath(fileTarget.file.name) : ''} onClose={() => setFileTarget(null)} onMove={async dest => { if (fileTarget?.type === 'move') await fm.actions.move(fileTarget.file, dest); setFileTarget(null); }} />
      <RenameFileModal open={fileTarget?.type === 'rename'} initialName={fileTarget?.file.name || ''} isDir={fileTarget?.file.is_dir || false} onClose={() => setFileTarget(null)} onRename={async n => { if (fileTarget?.type === 'rename') await fm.actions.rename(fileTarget.file, n); setFileTarget(null); }} />
      <CompressFileModal open={fileTarget?.type === 'compress'} fileName={fileTarget?.file.name || ''} onClose={() => setFileTarget(null)} onCompress={async fmt => { if (fileTarget?.type === 'compress') await fm.actions.compress(fileTarget.file, fmt); setFileTarget(null); }} />
      <CompressFileModal open={modals.bulkCompress} fileName={`${fm.selected.size} item${fm.selected.size > 1 ? 's' : ''}`} onClose={() => setModals(m => ({ ...m, bulkCompress: false }))} onCompress={async fmt => { await fm.actions.bulkCompress(fmt); setModals(m => ({ ...m, bulkCompress: false })); }} />

      <DeleteFileModal
        open={!!deleteTarget}
        fileName={deleteTarget && 'file' in deleteTarget ? deleteTarget.file.name : ''}
        isDir={deleteTarget && 'file' in deleteTarget ? deleteTarget.file.is_dir : false}
        isBulk={deleteTarget && 'bulk' in deleteTarget}
        count={fm.selected.size}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget && 'file' in deleteTarget) {
            await fm.actions.delete(deleteTarget.file);
          } else if (deleteTarget && 'bulk' in deleteTarget) {
            await fm.actions.bulkDelete();
          }
        }}
      />

      {contextMenu && (
        <FileContextMenu
          file={contextMenu.file} position={contextMenu}
          onEdit={contextMenu.file.is_dir ? undefined : () => { setContextMenu(null); fm.navigateTo(contextMenu.file); }}
          onDownload={() => { handleDownload(contextMenu.file); setContextMenu(null); }}
          onCopy={() => { fm.actions.copy(contextMenu.file); setContextMenu(null); }}
          onDuplicate={() => { fm.actions.duplicate(contextMenu.file); setContextMenu(null); }}
          onMove={() => { setFileTarget({ type: 'move', file: contextMenu.file }); setContextMenu(null); }}
          onRename={() => { setFileTarget({ type: 'rename', file: contextMenu.file }); setContextMenu(null); }}
          onCompress={() => { setFileTarget({ type: 'compress', file: contextMenu.file }); setContextMenu(null); }}
          onExtract={isArchive(contextMenu.file.name) ? () => { fm.actions.decompress(contextMenu.file); setContextMenu(null); } : undefined}
          onDelete={() => { setDeleteTarget({ file: contextMenu.file }); setContextMenu(null); }}
          isArchive={isArchive(contextMenu.file.name)} extracting={fm.decompressing}
        />
      )}
      {searchContextMenu && <SearchContextMenu position={searchContextMenu} onOpenDirectory={() => { const dir = searchContextMenu.result.path.substring(0, searchContextMenu.result.path.lastIndexOf('/')) || '/'; fm.setCurrentPath(dir); fm.setSearch(''); setSearchContextMenu(null); }} />}

      <ClipboardPanel items={fm.clipboard} pasting={fm.pasting} onPaste={fm.actions.paste} onClear={() => fm.setClipboard([])} onRemove={p => fm.setClipboard(fm.clipboard.filter(x => x !== p))} />
      
      {fm.selected.size > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[95]">
          <div className="mx-auto max-w-2xl px-3 pb-[env(safe-area-inset-bottom)]">
            <div className="rounded-t-lg border border-neutral-800 bg-neutral-900/95 shadow-2xl backdrop-blur px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-neutral-300"><span className="font-medium">{fm.selected.size}</span> selected</div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button variant="secondary" onClick={fm.actions.bulkCopy} className="px-2 sm:px-3"><Icons.copy className="h-4 w-4" /><span className="hidden sm:inline ml-1">Copy</span></Button>
                  <Button variant="secondary" onClick={() => setModals(m => ({ ...m, bulkCompress: true }))} className="px-2 sm:px-3"><Icons.archive className="h-4 w-4" /><span className="hidden sm:inline ml-1">Compress</span></Button>
                  <Button variant="danger" onClick={() => setDeleteTarget({ bulk: true })} className="px-2 sm:px-3"><Icons.trash className="h-4 w-4" /><span className="hidden sm:inline ml-1">Delete</span></Button>
                  <Button variant="ghost" onClick={() => fm.toggleAll()} className="hidden sm:flex">Clear</Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
