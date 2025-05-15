import React from 'react';
import { Table, Button, Tooltip, Typography, Space, Card, Tag } from 'antd';
import { DownloadOutlined, ShareAltOutlined, FileZipOutlined, CopyOutlined, LockOutlined } from '@ant-design/icons';
import { formatSize, formatDate, formatCompressionRatio } from '../utils/fileUtils';

const { Text } = Typography;

export const FileList = ({ 
  files, 
  onDownload, 
  onShare, 
  onCopyShareLink, 
  onCopyPassword 
}) => {
  const columns = [
    {
      title: '文件名',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (text) => <Text ellipsis={{ tooltip: text }}>{text}</Text>
    },
    {
      title: '算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      width: 140,
      render: (algorithm) => {
        let color;
        switch (algorithm) {
          case 'zip':
            color = 'green';
            break;
          case 'huffman':
            color = 'geekblue';
            break;
          case 'lz77':
            color = 'volcano';
            break;
          case 'combined':
            color = 'purple';
            break;
          default:
            color = 'default';
        }
        return <Tag color={color}>{algorithm.toUpperCase()}</Tag>;
      }
    },
    {
      title: '原大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size) => formatSize(size)
    },
    {
      title: '压缩后大小',
      dataIndex: 'compressedSize',
      key: 'compressedSize',
      width: 120,
      render: (size) => formatSize(size)
    },
    {
      title: '压缩率',
      dataIndex: 'compressionRatio',
      key: 'compressionRatio',
      width: 100,
      render: (ratio) => formatCompressionRatio(ratio)
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (date) => formatDate(date)
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="下载压缩文件">
            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              size="small"
              onClick={() => onDownload(record.compressedName)}
            />
          </Tooltip>
          <Tooltip title="分享">
            <Button 
              icon={<ShareAltOutlined />} 
              size="small"
              onClick={() => onShare(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 分享信息显示
  const renderShareInfo = (file) => {
    if (!file.shareInfo) return null;

    return (
      <Card size="small" title="分享信息" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ marginRight: 8 }}>分享链接:</Text>
          <Text ellipsis style={{ flex: 1 }}>{file.shareInfo.share_url}</Text>
          <Button 
            icon={<CopyOutlined />} 
            size="small" 
            onClick={() => onCopyShareLink(file.shareInfo.share_url)}
          />
        </div>
        {file.shareInfo.is_password_protected && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Text style={{ marginRight: 8 }}><LockOutlined /> 密码:</Text>
            <Text code>{file.shareInfo.password}</Text>
            <Button 
              icon={<CopyOutlined />} 
              size="small" 
              style={{ marginLeft: 8 }}
              onClick={() => onCopyPassword(file.shareInfo.password)}
            />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ marginTop: 32 }}>
      <Typography.Title level={4}>压缩文件列表</Typography.Title>
      <Table 
        columns={columns} 
        dataSource={files}
        rowKey="id"
        expandable={{
          expandedRowRender: (record) => renderShareInfo(record),
          rowExpandable: (record) => record.shareInfo !== undefined,
        }}
        size="middle"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}; 