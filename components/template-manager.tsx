"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Template,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/templates";

interface TemplateManagerProps {
  selectedTemplate: Template | null;
  onSelectTemplate: (template: Template | null) => void;
}

export function TemplateManager({
  selectedTemplate,
  onSelectTemplate,
}: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  const handleCreate = () => {
    if (!newName.trim() || !newContent.trim()) return;

    const template = createTemplate(newName.trim(), newContent.trim());
    setTemplates((prev) => [...prev, template]);
    setIsCreating(false);
    setNewName("");
    setNewContent("");
    onSelectTemplate(template);
  };

  const handleUpdate = (id: string) => {
    if (!newName.trim() || !newContent.trim()) return;

    const updated = updateTemplate(id, {
      name: newName.trim(),
      content: newContent.trim(),
    });
    if (updated) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (selectedTemplate?.id === id) {
        onSelectTemplate(updated);
      }
    }
    setEditingId(null);
    setNewName("");
    setNewContent("");
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplate?.id === id) {
      onSelectTemplate(null);
    }
    setDeleteId(null);
  };

  const startEdit = (template: Template) => {
    setEditingId(template.id);
    setNewName(template.name);
    setNewContent(template.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setNewName("");
    setNewContent("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary">
          Message Library
        </h3>
        {!isCreating && !editingId && (
          <Button
            variant="outline"
            size="sm"
            className="btn-glow font-bold uppercase text-[10px] tracking-widest bg-black/40 border-white/10"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Entry
          </Button>
        )}
      </div>

      {/* Create Form */}
      {isCreating && (
        <Card className="p-5 glass-panel space-y-4 border-primary/50 shadow-[0_0_20px_rgba(255,153,0,0.1)]">
          <Input
            placeholder="Template identifier (e.g. Welcome Message)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-black/40 border-white/10 font-bold"
          />
          <Textarea
            placeholder="Message payload..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            className="bg-black/40 border-white/10 resize-none font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="font-bold uppercase text-[10px] tracking-widest" onClick={cancelEdit}>
              Abort
            </Button>
            <Button
              size="sm"
              className="btn-glow font-bold uppercase text-[10px] tracking-widest"
              onClick={handleCreate}
              disabled={!newName.trim() || !newContent.trim()}
            >
              Initialize Template
            </Button>
          </div>
        </Card>
      )}

      {/* Template List */}
      <ScrollArea className="h-[350px]">
        <div className="space-y-3 pr-4">
          {templates.map((template) =>
            editingId === template.id ? (
              <Card key={template.id} className="p-5 glass-panel space-y-4 border-primary/50 shadow-[0_0_20px_rgba(255,153,0,0.1)]">
                <Input
                  placeholder="Template name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-black/40 border-white/10 font-bold"
                />
                <Textarea
                  placeholder="Message content..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  className="bg-black/40 border-white/10 resize-none font-mono text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="font-bold uppercase text-[10px] tracking-widest" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="btn-glow font-bold uppercase text-[10px] tracking-widest"
                    onClick={() => handleUpdate(template.id)}
                    disabled={!newName.trim() || !newContent.trim()}
                  >
                    Commit Changes
                  </Button>
                </div>
              </Card>
            ) : (
              <Card
                key={template.id}
                className={`p-5 cursor-pointer transition-all duration-300 glass-panel hover:border-white/20 ${
                  selectedTemplate?.id === template.id
                    ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,153,0,0.1)]"
                    : "border-white/5 bg-black/40"
                }`}
                onClick={() => onSelectTemplate(template)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                      <h4 className="font-bold text-sm tracking-tight truncate">{template.name}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 font-medium leading-relaxed">
                      {template.content}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-white/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(template);
                      }}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-white/50 hover:text-white" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive/50 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(template.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          )}

          {templates.length === 0 && !isCreating && (
            <div className="text-center py-12 glass-panel border-dashed border-white/10 rounded-2xl">
              <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-20 text-primary" />
              <p className="text-sm font-bold text-white/50">NO TEMPLATES FOUND</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Create your first entry to begin</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Selected Template Preview */}
      {selectedTemplate && !editingId && (
        <div className="p-5 glass-panel border-primary/20 bg-primary/5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3">
             <Check className="w-4 h-4 text-primary opacity-50" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
            Active Selection
          </p>
          <p className="text-sm font-bold mb-2 text-white">{selectedTemplate.name}</p>
          <ScrollArea className="max-h-32">
            <p className="text-xs text-muted-foreground font-medium leading-relaxed whitespace-pre-wrap">
              {selectedTemplate.content}
            </p>
          </ScrollArea>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
