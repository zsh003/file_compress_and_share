import React, { useState, useEffect } from 'react';
import { Typography, Table, Tag, Spin } from 'antd';
import axiosInstance from '../utils/axios';
import { formatFileSize } from '../utils/fileUtils';
import moment from 'moment';

const { Title } = Typography;

export const HistoryPage = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/compression-history');
      
      // 格式化历史记录数据
      const formattedHistory = response.data.map(record => ({
        ...record,
        file_name: record.filename,
        status: 'completed', // 后端目前只返回完成的记录
        completed_at: moment(record.created_at).format('YYYY-MM-DD HH:mm:ss')
      }));
      
      setHistory(formattedHistory);
      setLoading(false);
    } catch (error) {
      console.error('获取历史记录失败:', error);
      setLoading(false);
    }
  };

  const getStatusTag = (status) => {
    switch (status) {
      case 'completed':
        return <Tag color="success">完成</Tag>;
      case 'failed':
        return <Tag color="error">失败</Tag>;
      case 'in_progress':
        return <Tag color="processing">进行中</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
    },
    {
      title: '算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (text) => text.toUpperCase(),
    },
    {
      title: '原始大小',
      dataIndex: 'original_size',
      key: 'original_size',
      render: (size) => formatFileSize(size),
    },
    {
      title: '压缩后大小',
      dataIndex: 'compressed_size',
      key: 'compressed_size',
      render: (size) => formatFileSize(size),
    },
    {
      title: '压缩率',
      dataIndex: 'compression_ratio',
      key: 'compression_ratio',
      render: (ratio) => `${ratio.toFixed(2)}%`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: getStatusTag,
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      key: 'completed_at',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>压缩历史记录</Title>
      {loading ? (
        <div style={{ textAlign: 'center', margin: '50px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table 
          columns={columns} 
          dataSource={history} 
          rowKey="id" 
          pagination={{ pageSize: 10 }}
        />
      )}
    </div>
  );
}; 