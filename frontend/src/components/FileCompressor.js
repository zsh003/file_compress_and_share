import React, { useState, useRef } from 'react';
import { message, Modal } from 'antd';
import { FileUploader } from './FileUploader';
import { CompressionProgress } from './CompressionProgress';
import { FileList } from './FileList';
import { ShareModal } from './ShareModal';
import { ALGORITHMS } from '../constants/algorithms';
import { copyToClipboard } from '../utils/fileUtils';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

export const FileCompressor = () => {
  const { token } = useAuth();
  const [algorithm, setAlgorithm] = useState(ALGORITHMS.ZIP);
  const [files, setFiles] = useState([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressionDetails, setCompressionDetails] = useState({});
  const [compressionTaskId, setCompressionTaskId] = useState(null);
  const [compressionStartTime, setCompressionStartTime] = useState(null);
  const [progressData, setProgressData] = useState([]);
  const [compressionSpeedData, setCompressionSpeedData] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const wsRef = useRef(null);
  const startTimeRef = useRef(null);

  const handleAlgorithmChange = (value) => {
    setAlgorithm(value);
  };

  const handleFileUpload = async (file) => {
    if (!token) {
      message.error('请先登录');
      return false;
    }

    setIsCompressing(true);
    setCompressionStartTime(Date.now());
    startTimeRef.current = Date.now();
    setProgressData([]);
    setCompressionSpeedData([]);
    setUploadProgress(0);
    setCompressionProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algorithm);

    try {
      const response = await axios.post('http://localhost:8000/compress', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      const { task_id } = response.data;
      setCompressionTaskId(task_id);
      connectWebSocket(task_id);

      return false; // 阻止默认上传行为
    } catch (error) {
      message.error('文件上传失败');
      setIsCompressing(false);
      return false;
    }
  };

  const connectWebSocket = (taskId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://localhost:8000/ws/${taskId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
        setCompressionProgress(data.progress);
        setCompressionDetails(data.details || {});
        
        setProgressData(prev => [...prev, {
          time: elapsedTime.toFixed(2),
          progress: data.progress
        }]);

        if (data.details && data.details.speed) {
          setCompressionSpeedData(prev => [...prev, {
            time: elapsedTime.toFixed(2),
            speed: data.details.speed
          }]);
        }
      } else if (data.type === 'complete') {
        handleCompressionComplete(data);
      } else if (data.type === 'error') {
        message.error(data.message || '压缩过程中出现错误');
        setIsCompressing(false);
      }
    };

    ws.onerror = () => {
      message.error('WebSocket连接错误');
      setIsCompressing(false);
    };

    ws.onclose = () => {
      console.log('WebSocket连接已关闭');
    };
  };

  const handleCompressionComplete = (data) => {
    setIsCompressing(false);
    setFiles(prev => [{
      name: data.original_name,
      compressedName: data.compressed_name,
      size: data.original_size,
      algorithm: algorithm,
      compressed: true,
      compressionDetails: {
        originalSize: data.original_size,
        compressedSize: data.compressed_size,
        compressionRatio: data.compression_ratio,
        timeElapsed: data.time_elapsed
      }
    }, ...prev]);
    message.success('文件压缩完成');
  };

  const handleStopCompression = async () => {
    if (!compressionTaskId) return;

    setIsStopping(true);
    try {
      await axios.post(`http://localhost:8000/stop_compression/${compressionTaskId}`, null, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      message.success('已停止压缩');
    } catch (error) {
      message.error('停止压缩失败');
    } finally {
      setIsStopping(false);
      setIsCompressing(false);
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
  };

  const handleDownload = async (fileName) => {
    try {
      const response = await axios.get(`http://localhost:8000/download/${fileName}`, {
        responseType: 'blob',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('下载失败');
    }
  };

  const handleShare = (file) => {
    setSelectedFile(file);
    setShowShareModal(true);
  };

  const handleDecompress = async (file) => {
    try {
      const response = await axios.post(`http://localhost:8000/decompress/${file.compressedName}`, null, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      message.success('文件解压成功');
      // 自动下载解压后的文件
      handleDownload(response.data.decompressed_name);
    } catch (error) {
      message.error('文件解压失败');
    }
  };

  const handleCopyShareLink = async (link) => {
    if (await copyToClipboard(link)) {
      message.success('分享链接已复制到剪贴板');
    } else {
      message.error('复制失败');
    }
  };

  const handleCopyPassword = async (password) => {
    if (await copyToClipboard(password)) {
      message.success('分享密码已复制到剪贴板');
    } else {
      message.error('复制失败');
    }
  };

  return (
    <div>
      <FileUploader
        algorithm={algorithm}
        onAlgorithmChange={handleAlgorithmChange}
        onFileUpload={handleFileUpload}
        isCompressing={isCompressing}
        isStopping={isStopping}
        onStopCompression={handleStopCompression}
      />

      <CompressionProgress
        isCompressing={isCompressing}
        algorithm={algorithm}
        uploadProgress={uploadProgress}
        compressionProgress={compressionProgress}
        compressionDetails={compressionDetails}
        compressionTaskId={compressionTaskId}
        ws={wsRef.current}
        compressionStartTime={compressionStartTime}
        progressData={progressData}
        compressionSpeedData={compressionSpeedData}
      />

      <FileList
        files={files}
        onDownload={handleDownload}
        onShare={handleShare}
        onDecompress={handleDecompress}
        onCopyShareLink={handleCopyShareLink}
        onCopyPassword={handleCopyPassword}
      />

      {showShareModal && (
        <ShareModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          file={selectedFile}
          token={token}
          onShareSuccess={(shareInfo) => {
            setFiles(prev => prev.map(f => 
              f === selectedFile ? { ...f, shareInfo } : f
            ));
            setShowShareModal(false);
          }}
        />
      )}
    </div>
  );
}; 