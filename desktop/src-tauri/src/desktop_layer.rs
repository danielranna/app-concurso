use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, FindWindowExW, FindWindowW, GetParent, GetWindowLongPtrW,
    GetWindowRect, IsWindow, SendMessageTimeoutW, SetParent, SetWindowLongPtrW, SetWindowPos,
    GWL_STYLE, HWND_TOP, SMTO_NORMAL, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
    SWP_SHOWWINDOW, WS_CHILD, WS_CLIPSIBLINGS, WS_POPUP, WS_VISIBLE,
};

const SPAWN_WORKER_W: u32 = 0x052C;

pub fn screen_origin(hwnd: HWND) -> Option<(i32, i32)> {
    unsafe {
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        Some((rect.left, rect.top))
    }
}

pub fn is_attached(hwnd: HWND) -> bool {
    unsafe {
        let Ok(parent) = GetParent(hwnd) else {
            return false;
        };
        if !IsWindow(Some(parent)).as_bool() {
            return false;
        }
        FindWindowExW(Some(parent), None, w!("SHELLDLL_DefView"), PCWSTR::null()).is_ok()
    }
}

pub fn attach(hwnd: HWND) -> bool {
    unsafe {
        let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) else {
            return false;
        };
        let mut result = 0usize;
        let _ = SendMessageTimeoutW(
            progman,
            SPAWN_WORKER_W,
            WPARAM(0),
            LPARAM(0),
            SMTO_NORMAL,
            1000,
            Some(&mut result),
        );

        let host = desktop_host(progman);
        if is_attached(hwnd) {
            if GetParent(hwnd).ok() == Some(host) {
                return true;
            }
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        let width = (rect.right - rect.left).max(1);
        let height = (rect.bottom - rect.top).max(1);

        let mut style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        style &= !WS_POPUP.0;
        style |= WS_CHILD.0 | WS_CLIPSIBLINGS.0 | WS_VISIBLE.0;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);

        if SetParent(hwnd, Some(host)).is_err() {
            return false;
        }

        let mut origin = POINT {
            x: rect.left,
            y: rect.top,
        };
        if !ScreenToClient(host, &mut origin).as_bool() {
            return false;
        }
        SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            origin.x,
            origin.y,
            width,
            height,
            SWP_SHOWWINDOW | SWP_FRAMECHANGED | SWP_NOACTIVATE,
        )
        .is_ok()
    }
}

pub fn detach(hwnd: HWND) {
    unsafe {
        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        let width = (rect.right - rect.left).max(1);
        let height = (rect.bottom - rect.top).max(1);

        let _ = SetParent(hwnd, None);
        let mut style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        style &= !WS_CHILD.0;
        style |= WS_POPUP.0 | WS_VISIBLE.0;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        let _ = SetWindowPos(
            hwnd,
            None,
            rect.left,
            rect.top,
            width,
            height,
            SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOACTIVATE,
        );
    }
}

pub fn move_to_screen(hwnd: HWND, x: i32, y: i32) {
    unsafe {
        let parent = GetParent(hwnd)
            .ok()
            .filter(|parent| IsWindow(Some(*parent)).as_bool());
        let (x, y) = if let Some(parent) = parent {
            let mut point = POINT { x, y };
            if !ScreenToClient(parent, &mut point).as_bool() {
                return;
            }
            (point.x, point.y)
        } else {
            (x, y)
        };
        let _ = SetWindowPos(
            hwnd,
            None,
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

fn desktop_host(progman: HWND) -> HWND {
    let mut host = HWND::default();
    let slot = &mut host as *mut HWND as isize;
    unsafe {
        let _ = EnumWindows(Some(enum_desktop_host), LPARAM(slot));
        if host.is_invalid() {
            let _ = EnumChildWindows(Some(progman), Some(enum_desktop_host), LPARAM(slot));
        }
    }
    if host.is_invalid() { progman } else { host }
}

unsafe extern "system" fn enum_desktop_host(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let found = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), PCWSTR::null());
    if found.is_ok() {
        let slot = lparam.0 as *mut HWND;
        if !slot.is_null() {
            *slot = hwnd;
        }
        return BOOL(0);
    }
    BOOL(1)
}
