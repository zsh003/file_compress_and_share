import React, { useState, useEffect } from 'react';
import { Typography, Spin, message } from 'antd';
import { FileList } from '../components/FileList';
import { ShareModal } from '../components/ShareModal';
import axiosInstance from '../utils/axios';
import { copyToClipboard } from '../utils/fileUtils';

const { Title } = Typography;

export const FilesPage = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/files');
      
      // 格式化文件数据以适应FileList组件期望的格式
      const formattedFiles = response.data.map(file => ({
        id: file.id,
        originalName: file.filename,
        compressedName: `${file.filename}.compressed`,
        algorithm: file.algorithm,
        size: file.original_size,
        compressedSize: file.compressed_size,
        compressionRatio: file.compression_ratio / 100, // 后端返回的是百分比值，需要转换为小数
        shareInfo: file.shareInfo,
        createdAt: file.created_at
      }));

      setFiles(formattedFiles);
      setLoading(false);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      message.error('获取文件列表失败');
      setLoading(false);
    }
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
      message.success('文件下载成功');
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

  const handleDecompress = async (file) => {
    try {
      // 创建FormData对象
      const formData = new FormData();
      // 获取压缩文件
      const response = await axiosInstance.get(`/download/${file.compressedName}`, {
        responseType: 'blob'
      });
      
      // 创建File对象
      const compressedFile = new File([response.data], file.compressedName, {
        type: 'application/octet-stream'
      });
      
      // 添加到FormData
      formData.append('file', compressedFile);
      formData.append('algorithm', file.algorithm);

      // 发送解压请求
      const decompressResponse = await axiosInstance.post('/decompress', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      
      // 自动下载解压后的文件
      handleDownload(decompressResponse.data.filename);
      message.success('文件解压成功');
    } catch (error) {
      message.error('文件解压失败: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleCopyShareLink = async (link) => {
    const success = await copyToClipboard(link);
    if (success) {
      message.success('链接已复制到剪贴板');
    } else {
      message.error('复制失败');
    }
  };

  const handleCopyPassword = async (password) => {
    const success = await copyToClipboard(password);
    if (success) {
      message.success('密码已复制到剪贴板');
    } else {
      message.error('复制失败');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>我的文件</Title>
      {loading ? (
        <div style={{ textAlign: 'center', margin: '50px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <FileList 
          files={files} 
          onDownload={handleDownload}
          onShare={handleShare}
          onDecompress={handleDecompress}
          onCopyShareLink={handleCopyShareLink}
          onCopyPassword={handleCopyPassword}
        />
      )}
      
      {selectedFile && (
        <ShareModal
          visible={showShareModal}
          file={selectedFile}
          onClose={() => setShowShareModal(false)}
          onSuccess={handleShareSuccess}
        />
      )}
    </div>
  );
}; 