import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import axiosInstance from '../utils/axios';

const { Text } = Typography;

export const ShareModal = ({ visible, onClose, file }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [shareInfo, setShareInfo] = useState(null);

  const handleShare = async (values) => {
    setLoading(true);
    try {
      const response = await axiosInstance.post(`/share/${file.id}`, {
        is_password_protected: true,
        password: values.password,
        expiration_hours: values.expirationHours || 24,
        max_downloads: values.maxDownloads || 1
      });

      setShareInfo(response.data);
      message.success('文件分享成功');
    } catch (error) {
      console.error('分享错误:', error);
      message.error('文件分享失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('复制成功');
    } catch (error) {
      message.error('复制失败');
    }
  };

  return (
    <Modal
      title="分享文件"
      open={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={600}
    >
      {!shareInfo ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleShare}
          initialValues={{
            expirationHours: 24,
            maxDownloads: 1
          }}
        >
          <Form.Item label="文件名">
            <Input value={file.filename} disabled />
          </Form.Item>

          <Form.Item
            name="password"
            label="分享密码"
            rules={[{ required: true, message: '请输入密码生成种子' }]}
          >
            <Input.Password placeholder="请输入密码生成种子" />
          </Form.Item>

          <Form.Item
            name="expirationHours"
            label="有效期（小时）"
            rules={[
              { required: true, message: '请输入分享链接有效期' },
              { type: 'number', min: 1, message: '有效期必须大于0小时' }
            ]}
          >
            <Input type="number" placeholder="默认24小时" />
          </Form.Item>

          <Form.Item
            name="maxDownloads"
            label="最大下载次数"
            rules={[
              { required: true, message: '请输入最大下载次数' },
              { type: 'number', min: 1, message: '下载次数必须大于等于1' }
            ]}
          >
            <Input type="number" placeholder="默认1次" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              生成分享链接
            </Button>
          </Form.Item>
        </Form>
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>分享链接：</Text>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <Text style={{ flex: 1, wordBreak: 'break-all' }}>
                {shareInfo.share_url}?password={shareInfo.password}
              </Text>
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => handleCopy(`${shareInfo.share_url}?password=${shareInfo.password}`)}
              >
                复制
              </Button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">
              有效期至：{new Date(shareInfo.expires_at).toLocaleString()}
            </Text>
          </div>
          <div>
            <Text type="secondary">
              最大下载次数：{shareInfo.max_downloads} 次
            </Text>
          </div>
          <div style={{ marginTop: 16 }}>
            <Button type="primary" onClick={onClose} block>
              关闭
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}; 