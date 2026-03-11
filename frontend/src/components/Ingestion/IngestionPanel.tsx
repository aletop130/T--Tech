'use client';

import { useState } from 'react';
import {
  Card,
  Elevation,
  Icon,
  Button,
  FileInput,
  Tag,
  ProgressBar,
  Callout,
  Intent,
} from '@blueprintjs/core';
import { api } from '@/lib/api';

type DataType = 'tle' | 'weather' | 'observations';

export function IngestionPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hiding, setHiding] = useState<'allied' | 'enemy' | null>(null);
  const [hideResult, setHideResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dataType, setDataType] = useState<DataType>('tle');

  const handleFileSelect = (e: React.FormEvent<HTMLInputElement>) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
        setUploadProgress(i);
      }
      switch (dataType) {
        case 'tle':          await api.uploadTLE(selectedFile); break;
        case 'weather':      await api.uploadSpaceWeather(selectedFile); break;
        case 'observations': await api.uploadObservations(selectedFile); break;
      }
      setUploadResult({ success: true, message: `Successfully uploaded ${selectedFile.name} (${dataType})` });
    } catch (error) {
      setUploadResult({ success: false, message: `Failed to upload: ${error}` });
    } finally {
      setUploading(false);
    }
  };

  const handleHideAllied  = async () => { setHiding('allied'); setHideResult(null); try { const r = await api.hideAlliedSatellites();  setHideResult(r); } catch (e) { setHideResult({ success: false, message: e instanceof Error ? e.message : 'Failed' }); } finally { setHiding(null); } };
  const handleShowAllied  = async () => { setHiding('allied'); setHideResult(null); try { const r = await api.showAlliedSatellites();  setHideResult(r); } catch (e) { setHideResult({ success: false, message: e instanceof Error ? e.message : 'Failed' }); } finally { setHiding(null); } };
  const handleHideEnemy   = async () => { setHiding('enemy');  setHideResult(null); try { const r = await api.hideEnemySatellites();   setHideResult(r); } catch (e) { setHideResult({ success: false, message: e instanceof Error ? e.message : 'Failed' }); } finally { setHiding(null); } };
  const handleShowEnemy   = async () => { setHiding('enemy');  setHideResult(null); try { const r = await api.showEnemySatellites();   setHideResult(r); } catch (e) { setHideResult({ success: false, message: e instanceof Error ? e.message : 'Failed' }); } finally { setHiding(null); } };

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="import" className="text-sda-accent-blue" />
          Data Ingestion
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="upload" />
            Upload Data
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-sda-text-secondary block mb-2">Data Type</label>
              <div className="flex gap-2">
                <Button icon="satellite"  active={dataType === 'tle'}          onClick={() => setDataType('tle')}>TLE File</Button>
                <Button icon="cloud"      active={dataType === 'weather'}      onClick={() => setDataType('weather')}>Space Weather</Button>
                <Button icon="eye-open"   active={dataType === 'observations'} onClick={() => setDataType('observations')}>Observations</Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-sda-text-secondary block mb-2">Select File</label>
              <FileInput text={selectedFile?.name || 'Choose file...'} onInputChange={handleFileSelect} fill disabled={uploading} />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-sda-text-secondary">
                <Icon icon="document" />
                <span>{selectedFile.name}</span>
                <span>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
            {uploading && (
              <div>
                <ProgressBar value={uploadProgress / 100} intent="primary" stripes animate />
                <div className="text-sm text-sda-text-secondary mt-1">Uploading... {uploadProgress}%</div>
              </div>
            )}
            {uploadResult && (
              <Callout intent={uploadResult.success ? 'success' : 'danger'} icon={uploadResult.success ? 'tick-circle' : 'error'}>
                {uploadResult.message}
              </Callout>
            )}
            <Button icon="cloud-upload" intent="primary" fill disabled={!selectedFile || uploading} onClick={handleUpload} loading={uploading}>
              Upload and Process
            </Button>
          </div>
        </Card>

        {/* Recent Runs */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="history" />
            Recent Ingestion Runs
          </h2>
          <div className="space-y-3">
            {[
              { id: '1', name: 'tle_catalog_2024.txt',       status: 'completed', records: 500, time: '2 hours ago' },
              { id: '2', name: 'space_weather.json',         status: 'completed', records: 50,  time: '5 hours ago' },
              { id: '3', name: 'observations_batch.json',    status: 'failed',    records: 0,   time: '1 day ago' },
            ].map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 bg-sda-bg-tertiary rounded-lg">
                <div>
                  <div className="font-medium">{run.name}</div>
                  <div className="text-xs text-sda-text-muted">{run.records} records • {run.time}</div>
                </div>
                <Tag intent={run.status === 'completed' ? 'success' : 'danger'} minimal>{run.status}</Tag>
              </div>
            ))}
          </div>
        </Card>

        {/* SDA Defense Controls */}
        <Card elevation={Elevation.TWO} className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="eye-off" className="text-sda-accent-yellow" />
            SDA Defense Controls
          </h2>
          <p className="text-sm text-sda-text-secondary mb-4">
            Hide or show satellite forces on the 3D map. Use these controls to focus on specific assets during analysis.
          </p>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px] p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="font-semibold text-blue-700 dark:text-blue-400">Allied Forces</span>
              </div>
              <div className="flex gap-2">
                <Button icon="eye-open" intent={Intent.SUCCESS} onClick={handleShowAllied} loading={hiding === 'allied'} small>Show</Button>
                <Button icon="eye-off"  intent={Intent.WARNING} onClick={handleHideAllied} loading={hiding === 'allied'} small>Hide</Button>
              </div>
            </div>
            <div className="flex-1 min-w-[200px] p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="font-semibold text-red-700 dark:text-red-400">Enemy Forces</span>
              </div>
              <div className="flex gap-2">
                <Button icon="eye-open" intent={Intent.SUCCESS} onClick={handleShowEnemy} loading={hiding === 'enemy'} small>Show</Button>
                <Button icon="eye-off"  intent={Intent.DANGER}  onClick={handleHideEnemy} loading={hiding === 'enemy'} small>Hide</Button>
              </div>
            </div>
          </div>
          {hideResult && (
            <Callout intent={hideResult.success ? 'success' : 'danger'} icon={hideResult.success ? 'tick-circle' : 'error'}>
              {hideResult.message}
            </Callout>
          )}
        </Card>

        {/* Data Quality */}
        <Card elevation={Elevation.TWO} className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tick-circle" className="text-sda-accent-green" />
            Data Quality Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">98.5%</div>
              <div className="text-sm text-sda-text-secondary">Schema Valid</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">99.2%</div>
              <div className="text-sm text-sda-text-secondary">Null Check Pass</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-yellow">95.8%</div>
              <div className="text-sm text-sda-text-secondary">Range Check Pass</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">100%</div>
              <div className="text-sm text-sda-text-secondary">Duplicate Check</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
