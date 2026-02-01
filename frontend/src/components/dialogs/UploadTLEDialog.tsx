'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  Button,
  Classes,
  FormGroup,
  FileInput,
  ProgressBar,
  Intent,
  Callout,
  Icon,
} from '@blueprintjs/core';
import { api } from '@/lib/api';

interface UploadTLEDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (runId: string) => void;
}

export function UploadTLEDialog({
  isOpen,
  onClose,
  onUploaded,
}: UploadTLEDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ run_id: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.tle')) {
        setError('Please select a .txt or .tle file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.tle')) {
        setError('Please select a .txt or .tle file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Simulate progress (actual upload doesn't provide progress events)
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const uploadResult = await api.uploadTLE(selectedFile);
      clearInterval(progressInterval);
      setProgress(100);
      setResult(uploadResult);

      if (onUploaded) {
        onUploaded(uploadResult.run_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload TLE file');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setSelectedFile(null);
      setProgress(0);
      setError(null);
      setResult(null);
      onClose();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload TLE Data"
      className="bp5-dark"
      style={{ width: '600px' }}
    >
      <div className={Classes.DIALOG_BODY}>
        {error && (
          <Callout intent={Intent.DANGER} className="mb-4">
            {error}
          </Callout>
        )}

        {result ? (
          <div>
            <Callout intent={Intent.SUCCESS} className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Upload Successful</h3>
              <p>
                File <strong>{result.filename}</strong> has been uploaded successfully.
              </p>
              <p className="mt-2 text-sm text-sda-text-secondary">
                Processing run ID: <code className="font-mono">{result.run_id}</code>
              </p>
            </Callout>
            <Button intent="primary" fill onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <FormGroup label="Select TLE File">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-sda-border-default rounded p-8 text-center cursor-pointer hover:border-sda-accent-blue transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon icon="cloud-upload" iconSize={48} className="text-sda-text-muted mb-2" />
                <p className="text-sda-text-secondary mb-2">
                  Drag and drop a TLE file here, or click to browse
                </p>
                <p className="text-xs text-sda-text-muted">
                  Supported formats: .txt, .tle
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.tle"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <Icon icon="document" />
                  <span className="text-sda-text-primary">{selectedFile.name}</span>
                  <span className="text-sda-text-muted">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}
            </FormGroup>

            {uploading && (
              <div className="mt-4">
                <ProgressBar value={progress / 100} intent={Intent.PRIMARY} />
                <p className="text-sm text-sda-text-secondary mt-2 text-center">
                  Uploading... {Math.round(progress)}%
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          {!result && (
            <>
              <Button onClick={handleClose} disabled={uploading}>
                Cancel
              </Button>
              <Button
                intent="primary"
                onClick={handleUpload}
                loading={uploading}
                disabled={!selectedFile || uploading}
              >
                Upload
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

