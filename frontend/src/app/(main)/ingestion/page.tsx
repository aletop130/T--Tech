'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  Elevation,
  Icon,
  Button,
  FileInput,
  Tag,
  ProgressBar,
  Callout,
} from '@blueprintjs/core';

export default function IngestionPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

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
      // Simulate upload progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
        setUploadProgress(i);
      }

      setUploadResult({
        success: true,
        message: `Successfully uploaded ${selectedFile.name}`,
      });
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Failed to upload: ${error}`,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
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
              <label className="text-sm text-sda-text-secondary block mb-2">
                Data Type
              </label>
              <div className="flex gap-2">
                <Button icon="satellite" active>
                  TLE File
                </Button>
                <Button icon="cloud">Space Weather</Button>
                <Button icon="eye-open">Observations</Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-sda-text-secondary block mb-2">
                Select File
              </label>
              <FileInput
                text={selectedFile?.name || 'Choose file...'}
                onInputChange={handleFileSelect}
                fill
                disabled={uploading}
              />
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
                <ProgressBar
                  value={uploadProgress / 100}
                  intent="primary"
                  stripes
                  animate
                />
                <div className="text-sm text-sda-text-secondary mt-1">
                  Uploading... {uploadProgress}%
                </div>
              </div>
            )}

            {uploadResult && (
              <Callout
                intent={uploadResult.success ? 'success' : 'danger'}
                icon={uploadResult.success ? 'tick-circle' : 'error'}
              >
                {uploadResult.message}
              </Callout>
            )}

            <Button
              icon="cloud-upload"
              intent="primary"
              fill
              disabled={!selectedFile || uploading}
              onClick={handleUpload}
              loading={uploading}
            >
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
              {
                id: '1',
                name: 'tle_catalog_2024.txt',
                status: 'completed',
                records: 500,
                time: '2 hours ago',
              },
              {
                id: '2',
                name: 'space_weather.json',
                status: 'completed',
                records: 50,
                time: '5 hours ago',
              },
              {
                id: '3',
                name: 'observations_batch.json',
                status: 'failed',
                records: 0,
                time: '1 day ago',
              },
            ].map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between p-3 bg-sda-bg-tertiary rounded-lg"
              >
                <div>
                  <div className="font-medium">{run.name}</div>
                  <div className="text-xs text-sda-text-muted">
                    {run.records} records • {run.time}
                  </div>
                </div>
                <Tag
                  intent={run.status === 'completed' ? 'success' : 'danger'}
                  minimal
                >
                  {run.status}
                </Tag>
              </div>
            ))}
          </div>
        </Card>

        {/* Data Quality */}
        <Card elevation={Elevation.TWO} className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="tick-circle" className="text-sda-accent-green" />
            Data Quality Summary
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">
                98.5%
              </div>
              <div className="text-sm text-sda-text-secondary">Schema Valid</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">
                99.2%
              </div>
              <div className="text-sm text-sda-text-secondary">
                Null Check Pass
              </div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-yellow">
                95.8%
              </div>
              <div className="text-sm text-sda-text-secondary">
                Range Check Pass
              </div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">
                100%
              </div>
              <div className="text-sm text-sda-text-secondary">
                Duplicate Check
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

