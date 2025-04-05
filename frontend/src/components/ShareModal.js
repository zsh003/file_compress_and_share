import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Space, Switch, Typography, Alert } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import axiosInstance from '../utils/axios';

const { Text } = Typography;

export const ShareModal = ({ visible, onClose, file, token, onShareSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(true);
  const [shareInfo, setShareInfo] = useState(null);

  const handleShare = async (values) => {
    setLoading(true);
    try {
      const response = await axiosInstance.post(
        `/share/${file.id}`,
        {
          is_password_protected: isPasswordProtected,
          expiration_hours: values.expirationHours || 24,
          max_downloads: values.maxDownloads || -1
        }
      );

      console.log('分享响应:', response.data);

      const newShareInfo = {
        shareLink: response.data.share_url,
        password: response.data.password,
        expiresAt: response.data.expires_at,
        maxDownloads: response.data.max_downloads
      };

      console.log('分享信息:', newShareInfo);

      setShareInfo(newShareInfo);
      onShareSuccess(newShareInfo);
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
            maxDownloads: -1
          }}
        >
          <Form.Item label="文件名">
            <Input value={file.originalName} disabled />
          </Form.Item>

          <Form.Item label="密码保护">
            <Switch
              checked={isPasswordProtected}
              onChange={setIsPasswordProtected}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
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
            tooltip="设置为-1表示不限制下载次数"
            rules={[
              { required: true, message: '请输入最大下载次数' },
              { type: 'number', min: -1, message: '下载次数必须大于等于-1' }
            ]}
          >
            <Input type="number" placeholder="默认不限制" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成分享链接
              </Button>
            </Space>
          </Form.Item>
        </Form>
      ) : (
        <div>
          <Alert
            message="分享链接已生成"
            description={
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>分享链接：</Text>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                    <Text copyable>{shareInfo.shareLink}</Text>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(shareInfo.shareLink)}
                    />
                  </div>
                </div>
                {shareInfo.password && (
                  <div>
                    <Text strong>分享密码：</Text>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                      <Text copyable>{shareInfo.password}</Text>
                      <Button
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(shareInfo.password)}
                      />
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">
                    有效期至：{new Date(shareInfo.expiresAt).toLocaleString()}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">
                    最大下载次数：{shareInfo.maxDownloads === -1 ? '不限制' : shareInfo.maxDownloads}
                  </Text>
                </div>
              </div>
            }
            type="success"
            showIcon
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}; 