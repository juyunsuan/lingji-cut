import { it, expect, vi } from 'vitest';
import { uploadTencentVideo } from '../../electron/publish/platforms/tencent';

/**
 * Mock page where every page.locator() / getByRole() / getByText() / getByLabel()
 * returns the SAME sharedLocator object so we can spy on setInputFiles across all calls.
 *
 * Key mock values chosen to make all upload-flow loops terminate immediately:
 *   count()       → 1   (locators "exist" → upload loop finds file input, collection > 1 check = 1>1 = false)
 *   isVisible()   → false (login markers absent, content-declaration absent)
 *   isDisabled()  → true  (skip the declare-original checkbox sub-branch)
 *   getAttribute() → 'weui-desktop-btn'  (no "_disabled" → upload-complete loop breaks)
 *   waitForURL()  → resolves (submit loop breaks)
 *   frames()      → [page]  (page acts as its own frame so input[type="file"] is found)
 */
function makeMockPage() {
  const sharedLocator: any = {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(false),
    isDisabled: vi.fn().mockResolvedValue(true),
    // 'weui-desktop-btn' has no 'weui-desktop-btn_disabled' → upload-complete loop breaks
    getAttribute: vi.fn().mockResolvedValue('weui-desktop-btn'),
    check: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn().mockResolvedValue(''),
    evaluate: vi.fn().mockResolvedValue(''),
    all: vi.fn().mockResolvedValue([]),
  };
  sharedLocator.first = () => sharedLocator;
  sharedLocator.nth = () => sharedLocator;
  sharedLocator.locator = vi.fn().mockReturnValue(sharedLocator);
  sharedLocator.getByText = vi.fn().mockReturnValue(sharedLocator);
  sharedLocator.getByRole = vi.fn().mockReturnValue(sharedLocator);
  sharedLocator.getByLabel = vi.fn().mockReturnValue(sharedLocator);
  sharedLocator.filter = vi.fn().mockReturnValue(sharedLocator);

  const page: any = {
    goto: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue(sharedLocator),
    getByRole: vi.fn().mockReturnValue(sharedLocator),
    getByText: vi.fn().mockReturnValue(sharedLocator),
    getByLabel: vi.fn().mockReturnValue(sharedLocator),
    getByPlaceholder: vi.fn().mockReturnValue(sharedLocator),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    // URL is a manage page (post-login) so any url-based checks pass
    url: vi.fn().mockReturnValue('https://channels.weixin.qq.com/platform/post/list'),
    _sharedLocator: sharedLocator,
  };
  // frames() returns [page] so _uploadVideoFile finds input[type="file"] on page.locator(...)
  page.frames = vi.fn().mockReturnValue([page]);

  return page;
}

it('uploadTencentVideo 把视频文件设置到 input[type="file"] 上', async () => {
  const page = makeMockPage();

  await uploadTencentVideo(page as any, {
    storageStatePath: '/c.json',
    filePath: '/tmp/v.mp4',
    title: '标题',
    desc: '描述',
    tags: ['a', 'b'],
    headless: true,
  });

  // _uploadVideoFile iterates page.frames()[0].locator('input[type="file"]').first()
  // page.frames()[0] = page (mock), page.locator(...) = sharedLocator, .first() = sharedLocator
  // So sharedLocator.setInputFiles('/tmp/v.mp4') must have been called.
  const { _sharedLocator: loc } = page;
  expect(loc.setInputFiles).toHaveBeenCalledWith('/tmp/v.mp4');
});
