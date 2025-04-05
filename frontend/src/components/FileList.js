import React from 'react';
import { Table, Button, Space, Tag, Tooltip } from 'antd';
import { DownloadOutlined, ShareAltOutlined, FileZipOutlined, CopyOutlined } from '@ant-design/icons';
import { getAlgorithmDisplayName, getAlgorithmColor } from '../constants/algorithms';

export const FileList = ({ 
  files, 
  onDownload, 
  onShare, 
  onDecompress,
  onCopyShareLink,
  onCopyPassword
}) => {
  const columns = [
    {
      title: '文件名',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            压缩后: {record.compressedName}
          </div>
        </div>
      )
    },
    {
      title: '压缩算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (algorithm) => (
        <Tag color={getAlgorithmColor(algorithm)}>
          {getAlgorithmDisplayName(algorithm)}
        </Tag>
      )
    },
    {
      title: '文件大小',
      dataIndex: 'size',
      key: 'size',
      render: (size) => {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
      }
    },
    {
      title: '压缩比',
      dataIndex: 'compressionRatio',
      key: 'compressionRatio',
      render: (ratio) => `${(ratio * 100).toFixed(2)}%`
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => onDownload(record.compressedName)}
          >
            下载
          </Button>
          <Button
            icon={<ShareAltOutlined />}
            onClick={() => onShare(record)}
          >
            分享
          </Button>
          <Button
            icon={<FileZipOutlined />}
            onClick={() => onDecompress(record)}
          >
            解压
          </Button>
          {record.shareInfo && (
            <>
              <Tooltip title="复制分享链接">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => onCopyShareLink(record.shareInfo.shareLink)}
                />
              </Tooltip>
              {record.shareInfo.password && (
                <Tooltip title="复制分享密码">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => onCopyPassword(record.shareInfo.password)}
                  />
                </Tooltip>
              )}
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <Table
        columns={columns}
        dataSource={files}
        rowKey="id"
        pagination={false}
      />
    </div>
  );
}; 