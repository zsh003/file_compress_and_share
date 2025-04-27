import React, { useState, useEffect } from 'react';
import { Typography, Spin } from 'antd';
import { FileList } from '../components/FileList';
import axiosInstance from '../utils/axios';

const { Title } = Typography;

export const FilesPage = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/files');
      setFiles(response.data);
      setLoading(false);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      setLoading(false);
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
        <FileList files={files} onRefresh={fetchFiles} />
      )}
    </div>
  );
}; 