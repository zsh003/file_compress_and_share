import React, { useState, useEffect } from 'react';
import { Typography, Table, Button, message, Space, Modal, Input, Dropdown, Menu } from 'antd';
import { ShareAltOutlined, CopyOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import axiosInstance from '../utils/axios';
import { copyToClipboard } from '../utils/fileUtils';
import moment from 'moment';

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
            
      // 格式化共享数据
      const formattedShares = response.data.map(share => ({
        ...share,
        link: share.share_url,
        created_at: moment(share.created_at).format('YYYY-MM-DD HH:mm:ss'),
        expires_at: moment(share.expires_at).format('YYYY-MM-DD HH:mm:ss')
      }));
      
      setShares(formattedShares);
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

  const handleCopyLinkWithPassword = async (link, password) => {
    // 如果链接中已经有查询参数，使用&添加密码参数，否则使用?
    const separator = link.includes('?') ? '&' : '?';
    const fullLink = `${link}${separator}password=${password}`;
    
    const success = await copyToClipboard(fullLink);
    if (success) {
      message.success('带密码的链接已复制到剪贴板');
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
      width: '15%',
      render: (text) => text || '未知文件',
    },
    {
      title: '共享链接',
      dataIndex: 'link',
      key: 'link',
      ellipsis: true,
      width: '25%',
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
      width: '10%',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '15%',
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: '15%',
    },
    {
      title: '下载次数',
      key: 'downloads',
      width: '10%',
      render: (_, record) => (
        <span>{record.current_downloads}/{record.max_downloads === -1 ? '不限' : record.max_downloads}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      render: (_, record) => {
        const menu = (
          <Menu>
            <Menu.Item key="copy" onClick={() => handleCopyLink(record.link)}>
              <CopyOutlined /> 复制链接
            </Menu.Item>
            {record.is_password_protected && record.password && (
              <Menu.Item key="copyWithPassword" onClick={() => handleCopyLinkWithPassword(record.link, record.password)}>
                <CopyOutlined /> 复制带密码链接
              </Menu.Item>
            )}
            <Menu.Item key="delete" danger onClick={() => {
              Modal.confirm({
                title: '确认删除共享',
                content: '确定要删除这个共享吗？此操作无法撤销。',
                onOk: () => handleDeleteShare(record.id),
              });
            }}>
              <DeleteOutlined /> 删除
            </Menu.Item>
          </Menu>
        );

        return (
          <Dropdown overlay={menu} trigger={['click']}>
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
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
        scroll={{ x: 1100 }}
      />
    </div>
  );
}; 