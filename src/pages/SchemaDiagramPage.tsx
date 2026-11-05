import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SchemaDiagram } from '../components/ui/SchemaDiagram';
import { resolveDiagramSchema } from '../utils/schemaDiagram';
import { Maximize2, Minimize2, RefreshCw, Download, Image, Code2, ChevronDown } from 'lucide-react';
import { downloadTextFile } from '../utils/diagramExport';
import { useTranslation } from 'react-i18next';
import { DatabaseProvider } from '../contexts/DatabaseProvider';
import { EditorProvider } from '../contexts/EditorProvider';

export const SchemaDiagramPage = () => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get('connectionId');
  const connectionName = searchParams.get('connectionName') || 'Unknown';
  const databaseName = searchParams.get('databaseName') || 'Unknown';
  const schema = searchParams.get('schema') || undefined;

  // On a single connection that exposes multiple databases (e.g. MySQL), the
  // diagram must be scoped to the selected database rather than the connection's
  // primary one. See resolveDiagramSchema for the full rationale.
  const effectiveSchema = resolveDiagramSchema(schema, databaseName);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const handleExportSvg = () => {
    const flowViewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!flowViewport) return;
    const serializer = new XMLSerializer();
    const content = serializer.serializeToString(flowViewport);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600" style="background:#0f172a"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`;
    downloadTextFile(svgString, `${databaseName || 'schema'}-erd.svg`, 'image/svg+xml');
    setIsExportMenuOpen(false);
  };

  const handleExportPng = () => {
    const flowViewport = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!flowViewport) return;
    const serializer = new XMLSerializer();
    const content = serializer.serializeToString(flowViewport);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600" style="background:#0f172a"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `${databaseName || 'schema'}-erd.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(pngUrl);
          }
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
    setIsExportMenuOpen(false);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Listen for fullscreen changes (e.g., ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Show error if no connectionId
  if (!connectionId) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-base">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-primary mb-2">
            {t('erDiagram.noConnection')}
          </h1>
          <p className="text-secondary">
            {t('erDiagram.noConnectionDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <DatabaseProvider>
      <EditorProvider>
        <div className="w-screen h-screen flex flex-col bg-base">
          {/* Minimal Header */}
          <div className="h-12 bg-elevated border-b border-default flex items-center justify-between px-4 shrink-0">
            <h1 className="text-primary font-semibold">
              {databaseName}{schema ? ` / ${schema}` : ''} ({connectionName})
            </h1>
            <div className="flex items-center gap-2">
                            {/* Export Diagram Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                  title={t("schemaDiagram.exportTooltip")}
                >
                  <Download size={15} />
                  <span>{t('erDiagram.export')}</span>
                  <ChevronDown size={14} className="opacity-80" />
                </button>

                {isExportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-48 bg-elevated border border-strong rounded-xl shadow-2xl py-1.5 z-50 text-xs font-sans">
                    <button
                      onClick={handleExportPng}
                      className="w-full px-3 py-2 flex items-center gap-2 text-primary hover:bg-surface-secondary text-left transition-colors"
                    >
                      <Image size={14} className="text-blue-400" />
                      <span>{t("schemaDiagram.exportPng")}</span>
                    </button>
                    <button
                      onClick={handleExportSvg}
                      className="w-full px-3 py-2 flex items-center gap-2 text-primary hover:bg-surface-secondary text-left transition-colors"
                    >
                      <Code2 size={14} className="text-emerald-400" />
                      <span>{t("schemaDiagram.exportSvg")}</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-primary rounded-lg border border-strong transition-colors text-sm"
                title={t('sidebar.refresh')}
              >
                <RefreshCw size={16} />
                {t('sidebar.refresh')}
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-primary rounded-lg border border-strong transition-colors text-sm"
                title={isFullscreen ? t('erDiagram.exitFullscreen') : t('erDiagram.enterFullscreen')}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 size={16} />
                    {t('erDiagram.exitFullscreen')}
                  </>
                ) : (
                  <>
                    <Maximize2 size={16} />
                    {t('erDiagram.enterFullscreen')}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Diagram Canvas */}
          <div className="flex-1 overflow-hidden">
            <SchemaDiagram connectionId={connectionId} refreshTrigger={refreshTrigger} schema={effectiveSchema} />
          </div>
        </div>
      </EditorProvider>
    </DatabaseProvider>
  );
};
