import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download } from "lucide-react";

export function DocumentViewerDialog({ open, onOpenChange, docUrl, docName }) {
  const downloadUrl = docUrl ? `${docUrl}${docUrl.includes('?') ? '&' : '?'}download=true` : "#";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="mb-2 shrink-0 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="truncate pr-4">{docName || "Document Viewer"}</DialogTitle>
            <DialogDescription className="sr-only">Document viewer modal</DialogDescription>
          </div>
          {docUrl && (
            <a 
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-md transition-colors mr-6"
            >
              <Download size={14} /> Download
            </a>
          )}
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-zinc-100 rounded-md overflow-hidden border border-zinc-200">
          {docUrl ? (
            <iframe 
              src={docUrl} 
              className="w-full h-full border-0" 
              title={docName || "Document"}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">No document selected</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
