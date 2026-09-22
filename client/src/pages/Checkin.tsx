import { useCallback, useEffect, useState } from 'react';
import { CameraOutlined, ClockCircleOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Pagination,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import QRCode from 'qrcode';
import { ApiError, activityApi, checkinApi, registrationApi } from '../api';
import { CheckinMethodTag } from '../components/StatusTags';
import type { Activity, CheckinBoardResult, CheckinCodeResult, CheckinRecord, Registration } from '../types';

/** 签到码自动轮换间隔（秒），略早于有效期以便用户无感切换 */
const REFRESH_AHEAD_SECONDS = 8;

export default function Checkin() {
  const { message } = App.useApp();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string | undefined>();
  const [activity, setActivity] = useState<Activity | null>(null);

  const [code, setCode] = useState<CheckinCodeResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [scanValue, setScanValue] = useState('');
  const [scanLoading, setScanLoading] = useState(false);

  const [approvedList, setApprovedList] = useState<Registration[]>([]);
  const [manualUserId, setManualUserId] = useState<string | undefined>();
  const [manualLoading, setManualLoading] = useState(false);

  const [board, setBoard] = useState<CheckinBoardResult | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [records, setRecords] = useState<CheckinRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(10);

  // 载入可签到的活动（已发布）
  useEffect(() => {
    void (async () => {
      const result = await activityApi.list({ page: 1, pageSize: 200, status: 'PUBLISHED' });
      setActivities(result.data);
      if (!activityId && result.data.length) setActivityId(result.data[0].activityId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activityId) {
      setActivity(null);
      return;
    }
    void (async () => {
      try {
        setActivity(await activityApi.detail(activityId));
      } catch {
        setActivity(null);
      }
    })();
  }, [activityId]);

  // 已通过的报名（手动补签候选）
  const loadApproved = useCallback(async () => {
    if (!activityId) return;
    try {
      const result = await registrationApi.list(activityId, { page: 1, pageSize: 1000, status: 'APPROVED' });
      setApprovedList(result.data);
    } catch {
      setApprovedList([]);
    }
  }, [activityId]);

  useEffect(() => {
    setManualUserId(undefined);
    void loadApproved();
  }, [loadApproved]);

  // 动态签到码
  const issueCode = useCallback(
    async (silent = false) => {
      if (!activityId) return;
      setCodeLoading(true);
      try {
        const next = await checkinApi.issueCode(activityId);
        setCode(next);
        setCountdown(next.expiresInSeconds);
        const dataUrl = await QRCode.toDataURL(next.payload, {
          width: 260,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrDataUrl(dataUrl);
        if (!silent) message.success('签到码已刷新');
      } catch (error) {
        if (!silent) message.error(error instanceof ApiError ? error.message : '获取签到码失败');
      } finally {
        setCodeLoading(false);
      }
    },
    [activityId, message]
  );

  useEffect(() => {
    void issueCode(true);
  }, [issueCode]);

  // 倒计时归零前自动换新码
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((seconds) => {
        if (seconds <= REFRESH_AHEAD_SECONDS) {
          void issueCode(true);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [issueCode]);

  // 实时看板 5 秒轮询
  const loadBoard = useCallback(async () => {
    if (!activityId) return;
    try {
      setBoard(await checkinApi.board(activityId));
    } catch {
      // 轮询失败不打扰用户，等下一次
    }
  }, [activityId]);

  useEffect(() => {
    setBoardLoading(true);
    void loadBoard().finally(() => setBoardLoading(false));
    const timer = setInterval(() => void loadBoard(), 5000);
    return () => clearInterval(timer);
  }, [loadBoard]);

  // 签到记录分页
  const loadRecords = useCallback(async () => {
    if (!activityId) return;
    try {
      const result = await checkinApi.list(activityId, { page: recordsPage, pageSize: recordsPageSize });
      setRecords(result.data);
      setRecordsTotal(result.page.total);
    } catch {
      setRecords([]);
    }
  }, [activityId, recordsPage, recordsPageSize]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const refreshAll = async () => {
    await Promise.all([issueCode(true), loadBoard(), loadApproved(), loadRecords()]);
    message.success('已刷新');
  };

  const handleScan = async () => {
    if (!activityId) return;
    const ticketCode = scanValue.trim();
    if (!ticketCode) {
      message.warning('请输入票码');
      return;
    }
    setScanLoading(true);
    try {
      const record = await checkinApi.scan({ activityId, ticketCode });
      message.success(`${record.name} 签到成功`);
      setScanValue('');
      await Promise.all([loadBoard(), loadApproved()]);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '签到失败');
    } finally {
      setScanLoading(false);
    }
  };

  const handleManual = async () => {
    if (!activityId || !manualUserId) return;
    setManualLoading(true);
    try {
      const record = await checkinApi.manual({ activityId, userId: manualUserId, operatorName: '管理员' });
      message.success(`已为 ${record.name} 手动补签`);
      setManualUserId(undefined);
      await Promise.all([loadBoard(), loadApproved()]);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '补签失败');
    } finally {
      setManualLoading(false);
    }
  };

  const recordColumns: ColumnsType<CheckinRecord> = [
    { title: '签到时间', dataIndex: 'checkinTime', width: 170, fixed: 'left' },
    { title: '学号', dataIndex: 'studentId', width: 110 },
    { title: '姓名', dataIndex: 'name', width: 110 },
    { title: '签到方式', dataIndex: 'method', width: 120, render: (value) => <CheckinMethodTag method={value} /> },
    { title: '补签操作人', dataIndex: 'operatorName', width: 140, render: (value) => value ?? '-' },
    { title: '签到ID', dataIndex: 'checkinId', width: 130 },
  ];

  return (
    <div>
      <div className="cc-toolbar">
        <span>活动：</span>
        <Select
          value={activityId}
          style={{ width: 320 }}
          placeholder="选择已发布活动"
          options={activities.map((a) => ({ value: a.activityId, label: a.title }))}
          onChange={(value) => {
            setActivityId(value);
            setRecordsPage(1);
            setBoard(null);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
          全部刷新
        </Button>
        <span className="spacer" />
        {activity && (
          <span style={{ color: '#888' }}>
            {activity.startTime} ~ {activity.endTime} · {activity.location}
          </span>
        )}
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title="动态签到码"
            extra={
              <Button size="small" icon={<SyncOutlined />} loading={codeLoading} onClick={() => void issueCode()}>
                立即刷新
              </Button>
            }
          >
            <div style={{ textAlign: 'center' }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="活动签到二维码" style={{ width: 260, height: 260 }} />
              ) : (
                <div style={{ width: 260, height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <Spin tip="生成签到码…" />
                </div>
              )}
            </div>
            <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="small">
              <Space>
                <ClockCircleOutlined />
                <span style={countdown > 0 && countdown <= REFRESH_AHEAD_SECONDS ? { color: '#cf1322' } : undefined}>
                  {countdown > 0 ? `${countdown} 秒后自动刷新` : '等待刷新…'}
                  （有效期 {code?.expiresInSeconds ?? 60} 秒）
                </span>
              </Space>
              {code && <Alert type="info" showIcon message={`签到窗口：${code.checkinWindow}`} />}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                成员端出示电子票二维码；扫码或手工输入票码均可签到。
              </Typography.Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="扫码 / 手工签到" extra={<CameraOutlined />}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="输入电子票票码"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onPressEnter={() => void handleScan()}
                allowClear
              />
              <Button type="primary" loading={scanLoading} onClick={() => void handleScan()}>
                签到
              </Button>
            </Space.Compact>

            <Divider2 />

            <Typography.Text strong>手动补签</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder="选择已通过审核且未签到的成员"
              showSearch
              value={manualUserId}
              onChange={setManualUserId}
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={approvedList
                .filter((r) => !board?.latest.some((c) => c.userId === r.userId))
                .map((r) => ({ value: r.userId, label: `${r.name}（${r.studentId}）` }))}
            />
            <Button
              block
              style={{ marginTop: 12 }}
              loading={manualLoading}
              disabled={!manualUserId}
              onClick={() => void handleManual()}
            >
              确认手动补签
            </Button>
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              补签记录操作人并计入签到率；已签到的成员会被后端唯一约束拒绝。
            </Typography.Text>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title="实时签到看板"
            extra={
              <Space size="small">
                <SyncOutlined spin={boardLoading} />
                <span style={{ color: '#888', fontSize: 12 }}>5 秒自动刷新</span>
              </Space>
            }
          >
            {board ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Row gutter="middle">
                  <Col span={8}>
                    <Statistic title="已批准" value={board.approved} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="已签到" value={board.checkedIn} valueStyle={{ color: '#1677ff' }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="签到率" value={board.checkinRate} suffix="%" />
                  </Col>
                </Row>
                <Progress percent={board.checkinRate} status={board.checkinRate >= 90 ? 'success' : 'active'} />
                <div>
                  <Typography.Text strong>最新签到</Typography.Text>
                  <Table
                    rowKey="checkinId"
                    size="small"
                    columns={[
                      { title: '时间', dataIndex: 'checkinTime', width: 120, render: (value: string) => value.slice(5, 16) },
                      { title: '姓名', dataIndex: 'name', width: 90 },
                      { title: '方式', dataIndex: 'method', width: 90, render: (value) => <CheckinMethodTag method={value} /> },
                    ]}
                    dataSource={board.latest.slice(0, 6)}
                    pagination={false}
                  />
                </div>
              </Space>
            ) : (
              <Empty description="暂无看板数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="签到记录" style={{ marginTop: 16 }}>
        <Table rowKey="checkinId" columns={recordColumns} dataSource={records} pagination={false} scroll={{ x: 700 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            current={recordsPage}
            pageSize={recordsPageSize}
            total={recordsTotal}
            showSizeChanger
            showTotal={(count) => `共 ${count} 条签到`}
            onChange={(nextPage, nextPageSize) => {
              setRecordsPage(nextPage);
              setRecordsPageSize(nextPageSize);
            }}
          />
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Tabs
          items={[
            {
              key: 'rules',
              label: '签到口径说明',
              children: (
                <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small" style={{ marginTop: 16 }}>
                  <Descriptions.Item label="签到资格">仅「已通过」且未取消的报名可签到</Descriptions.Item>
                  <Descriptions.Item label="时间窗口">活动开始前 30 分钟至结束后 30 分钟</Descriptions.Item>
                  <Descriptions.Item label="防重复">同一报名唯一约束兜底，重复提交直接拒绝</Descriptions.Item>
                  <Descriptions.Item label="手动补签">记录操作人与渠道，计入签到率</Descriptions.Item>
                  <Descriptions.Item label="签到码">载荷携带有效期，过期需刷新</Descriptions.Item>
                  <Descriptions.Item label="活动下架">仅停止新报名，已有报名与签到不受影响</Descriptions.Item>
                </Descriptions>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function Divider2() {
  return <div style={{ height: 1, background: '#f0f0f0', margin: '24px 0' }} />;
}
