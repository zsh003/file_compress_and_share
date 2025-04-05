import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Space, Switch } from 'antd';
import axios from 'axios';

export const ShareModal = ({ visible, onClose, file, token, onShareSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(true);

  const handleShare = async (values) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `http://localhost:8000/share/${file.compressedName}`,
        {
          password_protected: isPasswordProtected,
          expiration_hours: values.expirationHours || 24,
          max_downloads: values.maxDownloads || -1
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const shareInfo = {
        link: `http://localhost:8000/shared/${response.data.share_id}`,
        password: response.data.password,
        expiresAt: response.data.expires_at,
        maxDownloads: response.data.max_downloads
      };

      onShareSuccess(shareInfo);
      message.success('文件分享成功');
    } catch (error) {
      message.error('文件分享失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="分享文件"
      open={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
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
          <Input value={file.name} disabled />
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
    </Modal>
  );
}; 