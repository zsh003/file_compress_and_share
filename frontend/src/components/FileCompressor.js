import React, { useState, useRef } from 'react';
import { message, Modal } from 'antd';
import { FileUploader } from './FileUploader';
import { CompressionProgress } from './CompressionProgress';
import { FileList } from './FileList';
import { ShareModal } from './ShareModal';
import { ALGORITHMS } from '../constants/algorithms';
import { copyToClipboard } from '../utils/fileUtils';
import { useAuth } from '../contexts/AuthContext';
import axiosInstance from '../utils/axios';

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
    setIsCompressing(true);
    setCompressionStartTime(Date.now());
    startTimeRef.current = Date.now();
    setProgressData([]);
    setCompressionSpeedData([]);
    setUploadProgress(0);
    setCompressionProgress(0);
    setCompressionDetails({
      wsConnected: false,
      original_size: 0,
      current_size: 0,
      speed: 0,
      time_elapsed: 0
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algorithm);

    try {
      // 先建立WebSocket连接
      const token = localStorage.getItem('token');
      const taskId = crypto.randomUUID(); // 生成一个新的任务ID
      setCompressionTaskId(taskId);
      
      console.log('准备建立WebSocket连接...');
      const ws = new WebSocket(`ws://localhost:8000/ws/compression?token=Bearer ${token}&task_id=${taskId}`);
      
      // 等待WebSocket连接建立
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket连接超时'));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('WebSocket连接已建立');
          resolve();
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('WebSocket连接错误:', error);
          reject(error);
        };
      });

      wsRef.current = ws;
      setCompressionDetails(prev => ({
        ...prev,
        wsConnected: true
      }));

      // WebSocket连接建立后，再上传文件
      const response = await axiosInstance.post('/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      console.log('文件上传成功，开始压缩...');

      // 设置WebSocket消息处理
      ws.onmessage = (event) => {
        console.log('收到WebSocket消息:', event.data);
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          setCompressionProgress(data.progress);
          setCompressionDetails(prev => ({
            ...prev,
            ...data.details,
            wsConnected: true
          }));
          
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
          message.error(data.error || '压缩过程中出现错误');
          setIsCompressing(false);
          setCompressionDetails(prev => ({
            ...prev,
            wsConnected: false
          }));
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        message.error('WebSocket连接错误');
        setIsCompressing(false);
        setCompressionDetails(prev => ({
          ...prev,
          wsConnected: false
        }));
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket连接已关闭:', event.code, event.reason);
        setCompressionDetails(prev => ({
          ...prev,
          wsConnected: false
        }));
        if (event.code === 1006) {
          message.error('WebSocket连接异常断开');
          setIsCompressing(false);
        }
      };

      wsRef.current = ws;
      return false; // 阻止默认上传行为

    } catch (error) {
      console.error('上传或连接出错:', error);
      message.error(error.message || '文件上传失败');
      setIsCompressing(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return false;
    }
  };

  const handleCompressionComplete = (data) => {
    console.log('压缩完成:', data);
    setIsCompressing(false);
    setCompressionProgress(100);
    setCompressionDetails(prev => ({
      ...prev,
      wsConnected: false
    }));
    
    // 关闭WebSocket连接
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // 显示成功消息
    message.success('文件压缩完成！');
    
    // 重置状态
    setCompressionTaskId(null);
    setCompressionStartTime(null);
    setProgressData([]);
    setCompressionSpeedData([]);
  };

  const handleStopCompression = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsCompressing(false);
    setCompressionDetails(prev => ({
      ...prev,
      wsConnected: false
    }));
    message.info('已停止压缩');
  };

  const handleDownload = async (fileName) => {
    try {
      const response = await axiosInstance.get(`/download/${fileName}`, {
        responseType: 'blob'
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
      const response = await axiosInstance.post(`/decompress/${file.compressedName}`);
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