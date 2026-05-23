import { useEffect, useState, useRef } from 'react'
import { Upload, Image, FileText, File, Trash2, Download, Cloud } from 'lucide-react'
import { format } from 'date-fns'
import api from '../lib/api'

export default function Files() {
  const [files, setFiles] = useState<any[]>([])
  const [storage, setStorage] = useState({ usedBytes: 0, limitBytes: 1073741824 })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string>('')
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = async () => {
    try {
      setLoading(true)
      const [filesRes, storageRes] = await Promise.all([
        api.get('/files'),
        api.get('/files/storage-info')
      ])
      setFiles(filesRes.data.files ?? [])
      setStorage(storageRes.data)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Dosyalar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const handleFileSelect = async (selectedFile: File) => {
    try {
      setUploading(true)
      setUploadProgress(0)
      
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      await api.post('/files/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 0
          setUploadProgress(progress)
        }
      })
      
      loadFiles()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Dosya yüklenemedi')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const deleteFile = async (id: string) => {
    try {
      await api.delete(`/files/${id}`)
      setShowDeleteModal(null)
      loadFiles()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Dosya silinemedi')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd.MM.yyyy')
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image size={32} className="text-blue-400" />
    if (mimeType === 'application/pdf') return <FileText size={32} className="text-red-400" />
    return <File size={32} className="text-gray-400" />
  }

  const usedMB = Math.round(storage.usedBytes / (1024 * 1024))
  const limitMB = Math.round(storage.limitBytes / (1024 * 1024))
  const usagePercent = Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))

  return (
    <div className="p-8">
      <div className="p-4 mb-8 bg-amber-900/20 border border-amber-800/50 rounded-lg flex items-center gap-3">
        <Cloud size={20} className="text-amber-400" />
        <p className="text-amber-200 text-sm">
          Dosya depolama yakında Ki Cloud'a taşınacak. Şu an yerel depolama aktif.
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dosyalar</h1>
        <div className="flex items-center gap-8">
          <div className="w-80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Depolama Kullanımı</span>
              <span className="text-gray-300 text-sm">{usedMB} MB / {limitMB} MB</span>
            </div>
            <div className="w-full h-3 bg-[#111111] rounded-full overflow-hidden border border-[#2a2a2a]">
              <div 
                className="h-full bg-[#6366f1] transition-all duration-500"
                style={{ width: `${usagePercent}%` }}
              ></div>
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-lg"
          >
            <Upload size={16} />
            Dosya Yükle
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0])
              }
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {uploading && (
        <div className="mb-6 p-4 bg-[#111111] rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300 text-sm">Yükleniyor...</span>
            <span className="text-gray-400 text-sm">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-[#0a0a0a] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#6366f1] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-40 bg-[#111111] rounded-xl border border-[#2a2a2a] animate-pulse"></div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="p-16 bg-[#111111] rounded-xl border border-[#2a2a2a] border-dashed text-center cursor-pointer hover:border-[#6366f1]/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Dosya yüklemek için tıklayın</h3>
          <p className="text-gray-500">veya buraya sürükleyin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {files.map(file => (
            <div key={file.id} className="p-4 bg-[#111111] rounded-xl border border-[#2a2a2a]">
              <div className="flex items-start justify-between mb-4">
                {getFileIcon(file.mimeType)}
                <div className="flex gap-2">
                  <a
                    href={`/api/v1/files/${file.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 hover:bg-[#222] rounded text-gray-400 hover:text-white"
                  >
                    <Download size={16} />
                  </a>
                  <button
                    onClick={() => setShowDeleteModal(file.id)}
                    className="p-2 hover:bg-red-900/20 rounded text-gray-400 hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-white font-medium truncate mb-2">{file.originalName}</p>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{formatSize(file.sizeBytes)}</span>
                <span>{formatDate(file.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[#111111] rounded-xl border border-[#2a2a2a] p-6 w-96">
            <h3 className="text-lg font-semibold text-white mb-2">Dosyayı Sil</h3>
            <p className="text-gray-400 mb-6">Bu dosyayı silmek istediğinizden emin misiniz?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 bg-[#222] text-gray-300 rounded-lg"
              >
                İptal
              </button>
              <button
                onClick={() => deleteFile(showDeleteModal)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
