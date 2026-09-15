import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ChevronDown, ChevronUp, Download, Edit2, FolderInput, FolderOpen, FolderPlus, Save, Search, Trash2, X } from "lucide-react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, TextInput } from "flowbite-react";
import { db, type Project } from "@/db";
import { getMpcAutofillImageUrl } from "@/helpers/mpcAutofillApi";
import { useProjectStore } from "@/store/projectStore";
import { useToastStore } from "@/store/toast";
import { ToastContainer } from "@/components/common";
import { ImageSource, type CardOption } from "../../../shared/types";

type ProjectSummary = {
  project: Project;
  cards: CardOption[];
  frontCards: CardOption[];
  uniqueCards: number;
  tcgs: string[];
  format: string;
};

const TCG_LABELS: Record<string, string> = { mtg: "MTG", pokemon: "Pokémon", palworld: "Palworld" };
const TCG_STYLES: Record<string, string> = {
  mtg: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  pokemon: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  palworld: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
};

function cardTcg(card: CardOption): string | null {
  if (card.source === ImageSource.TCGdex) return "pokemon";
  if (card.source === ImageSource.Palworld) return "palworld";
  if (card.source === ImageSource.Scryfall || card.source === ImageSource.MPC) return "mtg";
  return null;
}

function summarizeFormat(project: Project): string {
  const settings = (project.settings ?? {}) as Record<string, unknown>;
  const size = typeof settings.pageSizePreset === "string" ? settings.pageSizePreset : "Custom";
  const orientation = settings.pageOrientation === "landscape" ? "Landscape" : "Portrait";
  const columns = typeof settings.columns === "number" ? settings.columns : null;
  const rows = typeof settings.rows === "number" ? settings.rows : null;
  const dpi = typeof settings.dpi === "number" ? settings.dpi : null;
  return [size, orientation, columns && rows ? `${columns}×${rows}` : null, dpi ? `${dpi} DPI` : null]
    .filter(Boolean).join(" · ");
}

function ArtworkThumbnail({ card, large = false }: { card: CardOption; large?: boolean }) {
  const asset = useLiveQuery(async () => {
    if (!card.imageId) return null;
    if (card.source === ImageSource.MPC) return { url: getMpcAutofillImageUrl(card.imageId, "small") };
    if (/^(https?:|data:|blob:|\/)/.test(card.imageId)) return { url: card.imageId };

    const image = await db.images.get(card.imageId);
    const blob = image?.displayBlob ?? image?.baseDisplayBlob ?? image?.originalBlob;
    if (blob) return { blob };
    if (image?.sourceUrl) return { url: image.sourceUrl };

    if (card.isUserUpload || card.source === ImageSource.UploadLibrary) {
      const upload = await db.user_images.get(card.imageId);
      if (upload?.data) return { blob: upload.data };
    }
    return null;
  }, [card.imageId, card.source, card.isUserUpload]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!asset || !("blob" in asset) || !asset.blob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(asset.blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [asset]);

  const src = asset && "url" in asset ? asset.url : blobUrl;
  return (
    <div className={`${large ? "aspect-[63/88]" : "h-24 w-[4.3rem]"} overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700`} title={card.name}>
      {src ? <img src={src} alt={card.name} loading="lazy" className="h-full w-full object-cover" /> : (
        <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-gray-500">{card.name}</div>
      )}
    </div>
  );
}

export default function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => Promise<void> }) {
  const projects = useProjectStore((state) => state.projects);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const createProject = useProjectStore((state) => state.createProject);
  const renameProject = useProjectStore((state) => state.renameProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const switchProject = useProjectStore((state) => state.switchProject);
  const allCards = useLiveQuery(() => db.cards.toArray(), [], []);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const summaries = useMemo(() => {
    const byProject = new Map<string, CardOption[]>();
    for (const card of allCards ?? []) {
      if (!card.projectId) continue;
      const list = byProject.get(card.projectId) ?? [];
      list.push(card);
      byProject.set(card.projectId, list);
    }
    return projects.map((project): ProjectSummary => {
      const cards = byProject.get(project.id) ?? [];
      const frontCards = cards.filter((card) => !card.linkedFrontId).sort((a, b) => a.order - b.order);
      const tcgs = [...new Set(frontCards.map(cardTcg).filter((value): value is string => !!value))];
      if (tcgs.length === 0) {
        const activeTcg = ((project.settings ?? {}) as Record<string, unknown>).activeTcg;
        if (typeof activeTcg === "string" && TCG_LABELS[activeTcg]) tcgs.push(activeTcg);
      }
      return {
        project, cards, frontCards, tcgs,
        uniqueCards: new Set(frontCards.map((card) => card.name.trim().toLocaleLowerCase())).size,
        format: summarizeFormat(project),
      };
    });
  }, [projects, allCards]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return summaries;
    return summaries.filter(({ project, tcgs, format }) =>
      project.name.toLocaleLowerCase().includes(term) ||
      format.toLocaleLowerCase().includes(term) ||
      tcgs.some((tcg) => TCG_LABELS[tcg].toLocaleLowerCase().includes(term)));
  }, [summaries, search]);

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try {
      await action();
      useToastStore.getState().addToast({ message, type: "success", dismissible: true });
    } catch (error) {
      useToastStore.getState().showErrorToast(error instanceof Error ? error.message : "Project operation failed");
    } finally {
      setBusy(null);
    }
  };

  const exportOne = (project: Project) => run(`export:${project.id}`, async () => {
    const { exportProjectBackup } = await import("@/helpers/projectBackup");
    await exportProjectBackup([project.id], project.name);
  }, `Exported “${project.name}”`);

  const importBackup = (file: File) => run("import", async () => {
    const { importProjectBackup } = await import("@/helpers/projectBackup");
    const result = await importProjectBackup(file);
    await loadProjects();
    if (result.projectIds.length === 1) await switchProject(result.projectIds[0]);
  }, "Backup import complete");

  return (
    <div className="relative min-h-dvh bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Proxxied</div><h1 className="mt-1 text-3xl font-bold">Projects</h1><p className="mt-1 text-gray-500 dark:text-gray-400">Browse decks, artwork, and print layouts in one place.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button color="blue" onClick={() => setCreateOpen(true)}><FolderPlus className="mr-2 size-4" />New Project</Button>
            <Button color="gray" onClick={() => void run("backup-all", async () => { const { exportProjectBackup } = await import("@/helpers/projectBackup"); await exportProjectBackup(projects.map((p) => p.id), "proxxied-all-projects"); }, "All projects backed up")} disabled={!projects.length || !!busy}><Archive className="mr-2 size-4" />Backup All</Button>
            <Button color="gray" onClick={() => importRef.current?.click()} disabled={!!busy}><FolderInput className="mr-2 size-4" />Import</Button>
            <input ref={importRef} type="file" accept=".proxxied-backup,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importBackup(file); }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <div className="relative mb-6 max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" /><TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects, formats, or games…" className="[&_input]:pl-9" /></div>
        <div className="grid gap-5 lg:grid-cols-2">
          {visible.map(({ project, frontCards, uniqueCards, tcgs, format }) => {
            const expanded = expandedId === project.id;
            return (
              <article key={project.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
                <button className="w-full p-5 text-left" onClick={() => void onOpenProject(project.id)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><h2 className="truncate text-xl font-semibold">{project.name}</h2><p className="mt-1 text-sm text-gray-500">{format}</p></div>
                    {project.id === currentProjectId && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">Current</span>}
                  </div>
                  <div className="mt-4 flex min-h-24 gap-2 overflow-hidden">{frontCards.slice(0, 4).map((card) => <ArtworkThumbnail key={card.uuid} card={card} />)}{frontCards.length === 0 && <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-700">Empty project</div>}</div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{frontCards.length} cards</span><span className="text-gray-300">•</span><span className="text-gray-500">{uniqueCards} unique</span>{tcgs.map((tcg) => <span key={tcg} className={`rounded-full px-2 py-0.5 text-xs font-medium ${TCG_STYLES[tcg]}`}>{TCG_LABELS[tcg]}</span>)}</div>
                </button>
                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                  <Button size="xs" color="blue" onClick={() => void onOpenProject(project.id)}><FolderOpen className="mr-1 size-3.5" />Open</Button>
                  <Button size="xs" color="gray" onClick={() => setExpandedId(expanded ? null : project.id)}>{expanded ? <ChevronUp className="mr-1 size-3.5" /> : <ChevronDown className="mr-1 size-3.5" />}View cards</Button>
                  <div className="flex-1" />
                  <Button size="xs" color="gray" onClick={() => { setEditingId(project.id); setEditingName(project.name); }}><Edit2 className="size-3.5" /></Button>
                  <Button size="xs" color="gray" onClick={() => void exportOne(project)} disabled={!!busy}><Download className="size-3.5" /></Button>
                  <Button size="xs" color="red" onClick={() => setDeleteId(project.id)} disabled={!!busy}><Trash2 className="size-3.5" /></Button>
                </div>
                {expanded && <div className="border-t border-gray-100 p-5 dark:border-gray-800"><div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">{frontCards.map((card) => <button key={card.uuid} title={`Open ${project.name}`} onClick={() => void onOpenProject(project.id)} className="min-w-0 text-left"><ArtworkThumbnail card={card} large /><div className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">{card.name}</div></button>)}</div></div>}
              </article>
            );
          })}
        </div>
        {visible.length === 0 && <div className="py-24 text-center text-gray-500">No projects match your search.</div>}
      </main>

      <Modal show={!!editingId} onClose={() => setEditingId(null)} size="md"><ModalHeader>Rename Project</ModalHeader><ModalBody><TextInput value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && editingId && editingName.trim()) void run(`rename:${editingId}`, async () => { await renameProject(editingId, editingName.trim()); setEditingId(null); }, "Project renamed"); }} autoFocus /></ModalBody><ModalFooter><Button color="gray" onClick={() => setEditingId(null)}><X className="mr-1 size-4" />Cancel</Button><Button disabled={!editingName.trim() || !!busy} onClick={() => { if (editingId) void run(`rename:${editingId}`, async () => { await renameProject(editingId, editingName.trim()); setEditingId(null); }, "Project renamed"); }}><Save className="mr-1 size-4" />Save</Button></ModalFooter></Modal>
      <Modal show={!!deleteId} onClose={() => setDeleteId(null)} size="md"><ModalHeader>Delete Project</ModalHeader><ModalBody>Delete “{projects.find((p) => p.id === deleteId)?.name}” and all of its cards? This cannot be undone unless you exported a backup.</ModalBody><ModalFooter><Button color="gray" onClick={() => setDeleteId(null)}>Cancel</Button><Button color="red" disabled={!!busy} onClick={() => { if (deleteId) void run(`delete:${deleteId}`, async () => { await deleteProject(deleteId); setDeleteId(null); }, "Project deleted"); }}>Delete</Button></ModalFooter></Modal>
      <Modal show={createOpen} onClose={() => setCreateOpen(false)} size="md"><ModalHeader>New Project</ModalHeader><ModalBody><TextInput value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Project name" autoFocus /></ModalBody><ModalFooter><Button color="gray" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!createName.trim() || !!busy} onClick={() => void run("create", async () => { const id = await createProject(createName.trim()); setCreateName(""); setCreateOpen(false); await onOpenProject(id); }, "Project created")}>Create</Button></ModalFooter></Modal>
      <ToastContainer />
    </div>
  );
}
