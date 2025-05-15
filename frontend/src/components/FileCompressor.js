import React, { useState, useRef, useEffect } from 'react';
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
  const [compressionDetails, setCompressionDetails] = useState({
    wsConnected: false,
    original_size: 0,
    current_size: 0,
    speed: 0,
    time_elapsed: 0
  });
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
        } else if (data.type === 'completed') {
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
    
    // 刷新文件列表
    fetchFiles();
  };

  const handleStopCompression = () => {
    // 立即关闭WebSocket连接
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsCompressing(false);
    setIsStopping(false);
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

  const handleShareSuccess = (shareInfo) => {
    // 更新文件列表中的分享信息
    setFiles(prev => prev.map(f => 
      f.id === selectedFile.id ? { ...f, shareInfo } : f
    ));
    setShowShareModal(false);
  };

  const handleFileDecompress = async (file) => {
    try {
      message.loading('正在解压文件...', 0);
      
      // 创建FormData对象
      const formData = new FormData();
      formData.append('file', file);
      formData.append('algorithm', algorithm);

      // 发送解压请求
      const response = await axiosInstance.post('/decompress', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      message.destroy(); // 销毁加载消息
      message.success('文件解压成功');
      
      // 自动下载解压后的文件
      if (response.data && response.data.filename) {
        await handleDownload(response.data.filename);
      } else {
        message.warning('无法自动下载解压后的文件');
      }
      
      return false; // 阻止默认上传行为
    } catch (error) {
      message.destroy(); // 销毁加载消息
      console.error('文件解压失败:', error);
      message.error('文件解压失败: ' + (error.response?.data?.detail || error.message));
      return false;
    }
  };

  const handleCopyShareLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      message.success('分享链接已复制到剪贴板');
    } catch (error) {
      message.error('复制失败');
    }
  };

  const handleCopyPassword = async (password) => {
    try {
      await navigator.clipboard.writeText(password);
      message.success('分享密码已复制到剪贴板');
    } catch (error) {
      message.error('复制失败');
    }
  };

  const handleWebSocketMessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'progress') {
      setCompressionProgress(data.progress);
      setCompressionDetails(data.details);
      
      // 更新进度数据
      const time = data.details.time_elapsed;
      setProgressData(prev => [...prev, { time, progress: data.progress }]);
      setCompressionSpeedData(prev => [...prev, { time, speed: data.details.speed }]);
    } else if (data.type === 'completed') {
      // 立即关闭WebSocket连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      handleCompressionComplete(data);
    } else if (data.type === 'error') {
      // 立即关闭WebSocket连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      message.error(data.error || '压缩过程中出现错误');
      setIsCompressing(false);
      setCompressionDetails(prev => ({
        ...prev,
        wsConnected: false
      }));
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await axiosInstance.get('/files');
      // 确保文件数据格式正确
      const formattedFiles = response.data.map(file => ({
        id: file.id,
        originalName: file.filename,
        compressedName: `${file.filename}.compressed`,
        algorithm: file.algorithm,
        size: file.original_size,
        compressedSize: file.compressed_size,
        compressionRatio: file.compression_ratio,
        shareInfo: file.shareInfo,
        createdAt: file.created_at
      }));
      setFiles(formattedFiles);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error('获取文件列表失败');
    }
  };

  // 组件加载时获取文件列表
  useEffect(() => {
    fetchFiles();
  }, []);

  // 添加WebSocket关闭事件处理
  useEffect(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = (event) => {
        console.log('WebSocket连接已关闭:', event.code, event.reason);
        setCompressionDetails(prev => ({
          ...prev,
          wsConnected: false
        }));
      };
    }
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <FileUploader
        algorithm={algorithm}
        onAlgorithmChange={handleAlgorithmChange}
        onFileUpload={handleFileUpload}
        onFileDecompress={handleFileDecompress}
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
        compressionStartTime={compressionStartTime}
        progressData={progressData}
        compressionSpeedData={compressionSpeedData}
      />

      <FileList
        files={files}
        onDownload={handleDownload}
        onShare={handleShare}
        onDecompress={handleFileDecompress}
        onCopyShareLink={handleCopyShareLink}
        onCopyPassword={handleCopyPassword}
      />

      {showShareModal && selectedFile && (
        <ShareModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          file={selectedFile}
          token={token}
          onShareSuccess={handleShareSuccess}
        />
      )}
    </div>
  );
}; 