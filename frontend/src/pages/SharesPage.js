import React, { useState, useEffect } from 'react';
import { Typography, Table, Button, message, Space, Modal, Input } from 'antd';
import { ShareAltOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import axiosInstance from '../utils/axios';
import { copyToClipboard } from '../utils/fileUtils';

const { Title } = Typography;

export const SharesPage = () => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShares();
  }, []);

  const fetchShares = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/shares');
      setShares(response.data);
      setLoading(false);
    } catch (error) {
      console.error('获取共享列表失败:', error);
      setLoading(false);
    }
  };

  const handleCopyLink = async (link) => {
    const success = await copyToClipboard(link);
    if (success) {
      message.success('链接已复制到剪贴板');
    } else {
      message.error('复制失败');
    }
  };

  const handleDeleteShare = async (shareId) => {
    try {
      await axiosInstance.delete(`/shares/${shareId}`);
      message.success('共享已删除');
      fetchShares();
    } catch (error) {
      message.error('删除共享失败');
    }
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
    },
    {
      title: '共享链接',
      dataIndex: 'link',
      key: 'link',
      ellipsis: true,
      render: (text) => (
        <a href={text} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ),
    },
    {
      title: '访问密码',
      dataIndex: 'password',
      key: 'password',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button 
            icon={<CopyOutlined />} 
            onClick={() => handleCopyLink(record.link)}
          >
            复制链接
          </Button>
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => {
              Modal.confirm({
                title: '确认删除共享',
                content: '确定要删除这个共享吗？此操作无法撤销。',
                onOk: () => handleDeleteShare(record.id),
              });
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>共享管理</Title>
      <Table 
        columns={columns} 
        dataSource={shares} 
        rowKey="id" 
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}; 