// MUIのコンポーネントをインポート
import {
  Alert, AppBar, Button, Chip, Dialog, IconButton, LinearProgress,
  Slide, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography
} from '@mui/material'; // UI部品一式
import { styled } from '@mui/material/styles'; // スタイルユーティリティ
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'; // Reactのフック群

// DWVのアプリ本体とバージョン取得関数をインポート
import { App, getDwvVersion } from 'dwv'; // dwvのコアAPI

// タグ表示テーブル（後述の関数コンポーネント版）をインポート
import TagsTable from './TagsTable.jsx'; // DICOMタグ表示用

// アイコンをインポート
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'; // 断面切替
import CloseIcon from '@mui/icons-material/Close'; // 閉じる
import ContrastIcon from '@mui/icons-material/Contrast'; // WL/WW
import FolderOpenIcon from '@mui/icons-material/FolderOpen'; // フォルダ選択
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'; // タグ表示
import MenuIcon from '@mui/icons-material/Menu'; // スクロール
import RefreshIcon from '@mui/icons-material/Refresh'; // リセット
import SearchIcon from '@mui/icons-material/Search'; // ズーム/パン
import StraightenIcon from '@mui/icons-material/Straighten'; // 物差し(計測)
import UploadFileIcon from '@mui/icons-material/UploadFile'; // ファイル選択

// スタイルシートをインポート
import './DwvComponent.css'; // ビューワ周りの見た目

// CSSクラス接頭辞を定義
const PREFIX = 'DwvComponent'; // 名前空間用
// クラス名をまとめて定義
const classes = {
  appBar: `${PREFIX}-appBar`,   // ダイアログ上部バー
  title: `${PREFIX}-title`,     // タイトル
  iconSmall: `${PREFIX}-iconSmall` // 小さめアイコン
};

// ルートにスコープドスタイル適用
const Root = styled('div')(({ theme }) => ({ // ルート用スタイル
  [`& .${classes.appBar}`]: { position: 'relative' }, // AppBarの位置
  [`& .${classes.title}`]: { flex: '0 0 auto' },      // タイトルの伸縮
  [`& .${classes.iconSmall}`]: { fontSize: 20 }       // 小アイコンサイズ
}));

// ダイアログの表示遷移（下から上へスライド）
export const TransitionUp = React.forwardRef((props, ref) => ( // Transition定義
  <Slide direction="up" {...props} ref={ref} /> // 上方向へ
)); // forwardRefでMUIに渡す

// 関数コンポーネント本体
const DwvComponent = () => { // ビューワ本体

  // バージョン情報（初期のみ）
  const [versions] = useState({ dwv: getDwvVersion(), react: React.version }); // 表示用

  // 有効ツール一覧（固定）
  const [tools] = useState({ // 使用可能ツール
    Scroll: {},             // スクロール
    ZoomAndPan: {},         // ズーム＆パン
    WindowLevel: {},        // WL/WW
    Draw: { options: ['Ruler'] } // 計測：物差し
  }); // 基本ツールセット

  // 実行可否フラグ
  const [canScroll, setCanScroll] = useState(false);       // スクロール可否
  const [canWindowLevel, setCanWindowLevel] = useState(false); // WL可否

  // 選択ツール・進捗・ロード完了
  const [selectedTool, setSelectedTool] = useState('Select Tool'); // 現在ツール
  const [loadProgress, setLoadProgress] = useState(0);            // 進捗[%]
  const [dataLoaded, setDataLoaded] = useState(false);            // ロード完了

  // dwvアプリ・メタデータ
  const [dwvApp, setDwvApp] = useState(null); // dwvのAppインスタンス
  const [metaData, setMetaData] = useState({}); // DICOMメタ

  // 表示断面・タグダイアログ表示
  const [orientation, setOrientation] = useState(undefined); // axial/coronal/sagittal
  const [showDicomTags, setShowDicomTags] = useState(false); // タグダイアログ

  // ドロップボックス関連のDOM id/クラス（定数）
  const dropboxDivId = 'dropBox';              // ドロップ領域のid
  const dropboxClassName = 'dropBox';          // 基本クラス
  const borderClassName = 'dropBoxBorder';     // 枠線クラス
  const hoverClassName = 'hover';              // ホバー時クラス

  // フォルダ読み込み用の状態
  const [folderMap, setFolderMap] = useState(null); // { folderName: File[] }
  const [folderList, setFolderList] = useState([]); // フォルダ名一覧
  const [selectedFolder, setSelectedFolder] = useState(null); // 選択中フォルダ

  // input[type=file] を制御するref
  const inputRef = useRef(null); // 隠しファイル入力を直接操作

  // ツールに対応するアイコンを返す関数
  const getToolIcon = useCallback((tool) => { // アイコン解決
    if (tool === 'Scroll') return (<MenuIcon />);         // スクロール
    if (tool === 'ZoomAndPan') return (<SearchIcon />);   // ズーム/パン
    if (tool === 'WindowLevel') return (<ContrastIcon />); // WL/WW
    if (tool === 'Draw') return (<StraightenIcon />);     // 計測
    return null; // 未定義ツール
  }, []); // 依存なし

  // ツールの実行可否を判定
  const canRunTool = useCallback((tool) => { // 実行可能か
    if (tool === 'Scroll') return canScroll;         // スクロール可
    if (tool === 'WindowLevel') return canWindowLevel; // WL可
    return true; // それ以外は常に可
  }, [canScroll, canWindowLevel]); // フラグ依存

  // 描画形状（計測ツール）の切替
  const onChangeShape = useCallback((shape) => { // 形状変更
    if (dwvApp) dwvApp.setToolFeatures({ shapeName: shape }); // dwvに適用
  }, [dwvApp]); // アプリ依存

  // ツール切替のハンドラ
  const onChangeTool = useCallback((tool) => { // ツール変更
    if (!dwvApp) return; // 未初期化なら無視
    setSelectedTool(tool); // UIの選択状態
    dwvApp.setTool(tool);  // dwv側のツール反映
    if (tool === 'Draw') { // 計測ツールのとき
      onChangeShape(tools.Draw.options[0]); // 既定: Ruler
    } else { // それ以外
      const lg = dwvApp.getActiveLayerGroup(); // アクティブレイヤ
      lg?.setActiveLayer(0); // 画像レイヤに戻す
    }
  }, [dwvApp, onChangeShape, tools.Draw.options]); // 依存

  // レイアウトリセット
  const onReset = useCallback(() => { // リセット
    if (dwvApp) dwvApp.resetLayout(); // 初期状態へ
  }, [dwvApp]); // 依存

  // 表示断面のトグル切替
  const toggleOrientation = useCallback(() => { // 断面切替
    if (!dwvApp) return; // 未初期化回避
    // 次の断面を決定
    const next = orientation === 'axial'
      ? 'coronal'
      : orientation === 'coronal'
        ? 'sagittal'
        : orientation === 'sagittal'
          ? 'axial'
          : 'coronal'; // 初回はcoronal
    setOrientation(next); // state更新
    // dwvのViewConfigを更新
    dwvApp.setDataViewConfigs({ '*': [{ divId: 'layerGroup0', orientation: next }] }); // 断面適用
    // 全データを再描画
    for (const id of dwvApp.getDataIds()) dwvApp.render(id); // 再レンダ
  }, [dwvApp, orientation]); // 依存

  // タグダイアログの開閉
  const handleTagsDialogOpen = useCallback(() => setShowDicomTags(true), []);  // 開く
  const handleTagsDialogClose = useCallback(() => setShowDicomTags(false), []); // 閉じる

  // ドラッグイベントの既定処理
  const defaultHandleDragEvent = useCallback((event) => { // 既定抑止
    event.stopPropagation(); // 伝播停止
    event.preventDefault();  // 既定動作停止
  }, []); // 依存なし

  // ドロップ領域：dragover
  const onBoxDragOver = useCallback((event) => { // dragover
    defaultHandleDragEvent(event); // 既定抑止
    const box = document.getElementById(dropboxDivId); // 要素取得
    if (box && box.className.indexOf(hoverClassName) === -1) {
      box.className += ' ' + hoverClassName; // ホバー見た目付与
    }
  }, [defaultHandleDragEvent]); // 依存

  // ドロップ領域：dragleave
  const onBoxDragLeave = useCallback((event) => { // dragleave
    defaultHandleDragEvent(event); // 既定抑止
    const box = document.getElementById(dropboxDivId); // 要素取得
    if (box && box.className.indexOf(hoverClassName) !== -1) {
      box.className = box.className.replace(' ' + hoverClassName, ''); // 見た目解除
    }
  }, [defaultHandleDragEvent]); // 依存

  // ドロップ処理
  const onDrop = useCallback((event) => { // drop
    defaultHandleDragEvent(event); // 既定抑止
    if (dwvApp) dwvApp.loadFiles(event.dataTransfer.files); // ファイル群読み込み
  }, [defaultHandleDragEvent, dwvApp]); // 依存

  // input[file] のchange処理（フォルダまたは複数ファイル）
  const onInputFile = useCallback((event) => { // ファイル選択
    if (!(event.target && event.target.files)) return; // ガード
    const files = Array.from(event.target.files); // 配列化
    const map = {}; // フォルダ→ファイル配列
    for (const file of files) { // 全ファイル走査
      const rel = file.webkitRelativePath || file.name; // 相対/ファイル名
      const folder = rel.indexOf('/') !== -1 ? rel.split('/')[0] : '(root)'; // 先頭フォルダ
      if (!map[folder]) map[folder] = []; // 初期化
      map[folder].push(file); // 追加
    }
    const list = Object.keys(map).sort(); // フォルダ名一覧
    const first = list[0] || null; // 先頭を選択
    setFolderMap(map);        // map保存
    setFolderList(list);      // 一覧保存
    setSelectedFolder(first); // 選択保存
    setDataLoaded(false);     // ロード中へ
    setLoadProgress(0);       // 進捗リセット
    if (!dwvApp) return;      // ガード
    dwvApp.resetLayout();     // レイアウト初期化
    if (first) {              // フォルダ指定あり
      dwvApp.loadFiles(map[first]); // 選択フォルダを読み込む
    } else if (files.length) { // 単発ファイル
      dwvApp.loadFiles(files); // まとめて読み込む
    }
  }, [dwvApp]); // 依存

  // フォルダ切替時のロード
  const onSelectFolder = useCallback((folder) => { // フォルダ選択
    if (!folder || !folderMap || !dwvApp) return; // ガード
    setSelectedFolder(folder);  // 選択更新
    setDataLoaded(false);       // ロード中へ
    setLoadProgress(0);         // 進捗リセット
    dwvApp.resetLayout();       // レイアウト初期化
    dwvApp.loadFiles(folderMap[folder]); // 該当フォルダ読込
  }, [dwvApp, folderMap]); // 依存

  // ドロップボックスの表示/非表示とイベント付替え
  const showDropbox = useCallback((app, show) => { // 表示切替
    const box = document.getElementById(dropboxDivId); // ドロップ領域
    if (!box) return; // 要素未生成ガード
    const layerDiv = document.getElementById('layerGroup0'); // レイヤ領域

    if (show) { // 表示する場合
      box.className = `${dropboxClassName} ${borderClassName}`; // 枠線適用
      box.style.display = 'initial'; // 表示
      if (layerDiv) { // レイヤ側のD&Dを無効化
        layerDiv.removeEventListener('dragover', defaultHandleDragEvent);
        layerDiv.removeEventListener('dragleave', defaultHandleDragEvent);
        layerDiv.removeEventListener('drop', onDrop);
      }
      // ドロップボックスにD&Dイベントを付与
      box.addEventListener('dragover', onBoxDragOver);
      box.addEventListener('dragleave', onBoxDragLeave);
      box.addEventListener('drop', onDrop);
    } else { // 非表示にする場合
      box.className = dropboxClassName; // 枠線解除
      box.innerHTML = '';               // 表示文言は不要なので消去
      box.style.display = 'none';       // 非表示
      // ボックス側からイベントを外す
      box.removeEventListener('dragover', onBoxDragOver);
      box.removeEventListener('dragleave', onBoxDragLeave);
      box.removeEventListener('drop', onDrop);
      // レイヤ側でD&Dを受け付ける
      if (layerDiv) {
        layerDiv.addEventListener('dragover', defaultHandleDragEvent);
        layerDiv.addEventListener('dragleave', defaultHandleDragEvent);
        layerDiv.addEventListener('drop', onDrop);
      }
    }
  }, [defaultHandleDragEvent, onBoxDragLeave, onBoxDragOver, onDrop]); // 依存

  // 初回マウント時にdwvアプリを初期化
  useEffect(() => { // componentDidMount相当
    const app = new App(); // dwvのApp生成

    // 描画先と有効ツールを指定して初期化
    app.init({ dataViewConfigs: { '*': [{ divId: 'layerGroup0' }] }, tools }); // 初期化

    // 進捗・ロード関連のローカル変数（イベント間で共有）
    let nLoadItem = 0;              // 読み込んだアイテム数
    let nReceivedLoadError = 0;     // エラー数
    let nReceivedLoadAbort = 0;     // 中断数
    let isFirstRender = true;       // 初回描画フラグ

    // ロード開始
    app.addEventListener('loadstart', () => { // ロード開始
      nLoadItem = 0; nReceivedLoadError = 0; nReceivedLoadAbort = 0; isFirstRender = true; // 変数リセット
      showDropbox(app, false); // ドロップボックスを隠す
    });

    // 進捗イベント
    app.addEventListener('loadprogress', (e) => setLoadProgress(e.loaded)); // 0-100%

    // 描画完了（各データ初回）
    app.addEventListener('renderend', (event) => { // レンダ終了
      if (!isFirstRender) return; // 初回のみ
      isFirstRender = false;      // 初回処理を終えた
      const vl = app.getViewLayersByDataId(event.dataid)[0]; // ViewLayer取得
      const vc = vl.getViewController(); // ビューコントローラ
      if (vc.canScroll()) setCanScroll(true); // スクロール可否を反映
      if (vc.isMonochrome()) setCanWindowLevel(true); // WL可否を反映
      // 既定ツールを決定（スクロール可能ならScroll、なければZoomAndPan）
      const initial = vc.canScroll() ? 'Scroll' : 'ZoomAndPan'; // 初期ツール
      setSelectedTool(initial); // UI更新
      app.setTool(initial);     // dwv側も切替
    });

    // ロード完了
    app.addEventListener('load', (event) => { // ロード完了
      setMetaData(app.getMetaData(event.dataid)); // メタデータ保存
      setLoadProgress(100);  // 進捗を完了へ
      setDataLoaded(true);   // ボタンを有効化
    });

    // ロード終了（成功/失敗とも）
    app.addEventListener('loadend', () => { // ロード終了
      if (nReceivedLoadError) { // エラーがあれば
        setLoadProgress(0); alert('Received errors during load. Check log for details.'); // 通知
        if (!nLoadItem) showDropbox(app, true); // 何も読めてなければドロップを再表示
      }
      if (nReceivedLoadAbort) { // 中断時
        setLoadProgress(0); alert('Load was aborted.'); // 通知
        showDropbox(app, true); // ドロップを再表示
      }
    });

    // アイテム読込
    app.addEventListener('loaditem', () => { nLoadItem += 1; }); // カウント加算
    // エラー
    app.addEventListener('loaderror', (ev) => { console.error(ev.error); nReceivedLoadError += 1; }); // ログ
    // 中断
    app.addEventListener('loadabort', () => { nReceivedLoadAbort += 1; }); // 加算

    // キーボードとリサイズ
    app.addEventListener('keydown', (ev) => app.defaultOnKeydown(ev)); // 既定キー操作
    window.addEventListener('resize', app.onResize); // リサイズ対応

    // stateへ保存
    setDwvApp(app); // 他のハンドラで参照できるように保存

    // 初期はドロップボックスを表示（何もないときの案内）
    showDropbox(app, true); // D&D案内を見せる

    // URLパラメータからのロード（あれば）
    app.loadFromUri(window.location.href); // ?input=... 等

    // アンマウント時のクリーンアップ
    return () => { // componentWillUnmount
      showDropbox(app, false); // イベントを外す
      window.removeEventListener('resize', app.onResize); // リスナ解除
      // dwvのイベントは都度捨てるだけでOK（Appインスタンス破棄で解放）
    };
  }, [showDropbox, tools]); // 一度だけ（toolsは固定）

  // ツールボタン群をメモ化
  const toolsButtons = useMemo(() => ( // ツール→トグルボタン
    Object.keys(tools).map((tool) => ( // 各ツールでボタン作成
      <ToggleButton
        value={tool} key={tool} title={tool} // 値/キー/ツールチップ
        disabled={!dataLoaded || !canRunTool(tool)} // ロード前/不可ツールは無効
      >
        {getToolIcon(tool)} {/* 見た目用アイコン */}
      </ToggleButton>
    ))
  ), [tools, dataLoaded, canRunTool, getToolIcon]); // 依存

  // トグルグループ変更（選択ツールをdwvへ反映）
  const handleToolGroupChange = useCallback((e, newTool) => { // グループ変更
    if (newTool) onChangeTool(newTool); // 値があれば確定
  }, [onChangeTool]); // 依存

  // フォルダ選択ボタンのクリック（webkitdirectory有効）
  const clickSelectFolder = useCallback(() => { // フォルダ選択
    const input = inputRef.current; // 参照取得
    if (!input) return; // ガード
    input.webkitdirectory = true;  // ディレクトリ選択を有効化
    input.click();                 // ダイアログを開く
  }, []); // 依存なし

  // 単ファイル選択ボタンのクリック
  const clickSelectFiles = useCallback(() => { // ファイル選択
    const input = inputRef.current; // 参照
    if (!input) return; // ガード
    input.webkitdirectory = false; // 単ファイル選択に切替
    input.click();                 // ダイアログを開く
    setTimeout(() => { if (input) input.webkitdirectory = true; }, 0); // すぐ戻す
  }, []); // 依存なし

  // JSXの返却（UI）
  return (
    <Root className={classes.root} id="dwv">{/* ルート要素 */}
      <input
        id="input-file" // DOMで参照するid
        ref={inputRef}  // 制御用ref
        type="file"     // ファイル入力
        multiple        // 複数選択
        style={{ display: 'none' }} // 隠してボタンから起動
        onChange={onInputFile}      // 変更時の処理
      />
      <LinearProgress variant="determinate" value={loadProgress} />{/* 進捗バー */}
      <Stack direction="row" spacing={1} padding={1} justifyContent="center" flexWrap="wrap">
        <Alert severity="info" sx={{ width: '100%' }}>
          画像を読み込むには「フォルダを選択」ボタン、または下の領域にドラッグ＆ドロップしてください。
        </Alert>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="フォルダ内の画像をまとめて読み込み">
            <Button size="small" variant="contained" startIcon={<FolderOpenIcon />} onClick={clickSelectFolder}>
              フォルダを選択
            </Button>
          </Tooltip>
          <Tooltip title="ファイルを個別に選択して読み込み">
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={clickSelectFiles}>
              ファイルを選択
            </Button>
          </Tooltip>
          {folderList && folderList.length > 0 && (<Chip label={`${folderList.length} フォルダ`} size="small" />)}
        </Stack>

        <ToggleButtonGroup
          size="small" color="primary" value={selectedTool} exclusive onChange={handleToolGroupChange}
        >
          {toolsButtons}{/* ツールボタン群 */}
        </ToggleButtonGroup>

        {folderList && folderList.length > 0 && ( // フォルダ切替UI
          <ToggleButtonGroup
            size="small" color="secondary" value={selectedFolder} exclusive
            onChange={(e, f) => { if (f) onSelectFolder(f); }}
          >
            {folderList.map((folder) => ( // 各フォルダをボタン化
              <ToggleButton key={folder} value={folder} title={folder}>{folder}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        <ToggleButton size="small" value="reset" title="Reset" disabled={!dataLoaded} onChange={onReset}>
          <RefreshIcon />
        </ToggleButton>

        <ToggleButton size="small" value="toggleOrientation" title="Toggle Orientation" disabled={!dataLoaded} onClick={toggleOrientation}>
          <CameraswitchIcon />
        </ToggleButton>

        <ToggleButton size="small" value="tags" title="Tags" disabled={!dataLoaded} onClick={handleTagsDialogOpen}>
          <LibraryBooksIcon />
        </ToggleButton>

        <Dialog
          open={showDicomTags} onClose={handleTagsDialogClose} slots={{ transition: TransitionUp }}
        >
          <AppBar className={classes.appBar} position="sticky">
            <Toolbar>
              <IconButton color="inherit" onClick={handleTagsDialogClose} aria-label="Close"><CloseIcon /></IconButton>
              <Typography variant="h6" color="inherit" className={classes.flex}>DICOM Tags</Typography>
            </Toolbar>
          </AppBar>
          <TagsTable data={metaData} />{/* メタデータテーブル */}
        </Dialog>
      </Stack>

      <div id="layerGroup0" className="layerGroup">{/* dwvが描画する領域 */}
        <div id="dropBox">{/* ドロップ領域（案内テキストはJSで不要化） */}</div>
      </div>
    </Root>
  );
};

// 既定エクスポート
export default DwvComponent; // 関数コンポーネントを公開
