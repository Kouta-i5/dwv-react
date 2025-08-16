// MUIのコンポーネントをインポート
import {
  AppBar,
  Box,
  Button,
  Dialog,
  Divider,
  Grid,
  IconButton, LinearProgress,
  List, ListItem,
  ListItemText,
  Paper,
  Slide,
  ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography
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
import InvertColorsOffIcon from '@mui/icons-material/InvertColorsOff'; // グレースケール
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'; // タグ表示
import MenuIcon from '@mui/icons-material/Menu'; // スクロール
import PaletteIcon from '@mui/icons-material/Palette'; // カラー
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
  [`& .${classes.iconSmall}`]: { fontSize: 20 },       // 小アイコンサイズ
  flexDirection:'column',
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

  // カラーマップ（表示モード）
  const [colorMap, setColorMap] = useState('grayscale'); // 既定は白黒

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

  // ツールの説明（ホバー表示用）
  const getToolTooltip = useCallback((tool) => {
    if (tool === 'Scroll') return 'スクロール: マウス/ホイールでスライス移動';
    if (tool === 'ZoomAndPan') return 'ズーム/パン: ドラッグで移動、ホイール/ピンチで拡大縮小';
    if (tool === 'WindowLevel') return 'ウィンドウレベル/幅: ドラッグでコントラスト調整';
    if (tool === 'Draw') return '計測(物差し): 2点間の距離を測定';
    return tool;
  }, []);

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

  // カラーマップ適用（CSSフィルタで視覚的に切替）
  const applyColorMapCss = useCallback((mode) => {
    const canvases = document.querySelectorAll('#layerGroup0 canvas');
    canvases.forEach((canvas) => {
      canvas.style.filter = mode === 'grayscale' ? 'grayscale(1)' : 'none';
    });
  }, []);

  const onChangeColorMap = useCallback((e, mode) => {
    if (!mode) return;
    setColorMap(mode);
    applyColorMapCss(mode);
  }, [applyColorMapCss]);

  // カラーマップの再適用（データ読み込み直後や切替時に確実に反映）
  useEffect(() => {
    applyColorMapCss(colorMap);
  }, [colorMap, dataLoaded, applyColorMapCss]);

  // D&D機能は撤去

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
    // dwvApp.resetLayout();       // レイアウト初期化
    dwvApp.loadFiles(folderMap[folder]); // 該当フォルダ読込
  }, [dwvApp, folderMap]); // 依存

  // showDropbox などのD&D制御は撤去

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
      // 初回描画時にレイアウトをフィット（ズーム・センタリングを適正化）
      app.resetLayout();
      // カラーマップは state 監視の useEffect で適用する
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
      }
      if (nReceivedLoadAbort) { // 中断時
        setLoadProgress(0); alert('Load was aborted.'); // 通知
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

    // URLパラメータからのロード（あれば）
    app.loadFromUri(window.location.href); // ?input=... 等

    // アンマウント時のクリーンアップ
    return () => { // componentWillUnmount
      window.removeEventListener('resize', app.onResize); // リスナ解除
      // dwvのイベントは都度捨てるだけでOK（Appインスタンス破棄で解放）
    };
  }, [tools]); // 一度だけ（toolsは固定）

  // ツールボタン群をメモ化
  const toolsButtons = useMemo(() => ( // ツール→トグルボタン
    Object.keys(tools).map((tool) => ( // 各ツールでボタン作成
      <Tooltip key={tool} title={getToolTooltip(tool)} arrow>
        <ToggleButton
          value={tool} // 値
          disabled={!dataLoaded || !canRunTool(tool)} // ロード前/不可ツールは無効
        >
          {getToolIcon(tool)} {/* 見た目用アイコン */}
        </ToggleButton>
      </Tooltip>
    ))
  ), [tools, dataLoaded, canRunTool, getToolIcon, getToolTooltip]); // 依存

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
    <Root id="dwv">{/* ルート要素 */}
      <input
        id="input-file" // DOMで参照するid
        ref={inputRef}  // 制御用ref
        type="file"     // ファイル入力
        multiple        // 複数選択
        style={{ display: 'none' }} // 隠してボタンから起動
        onChange={onInputFile}      // 変更時の処理
      />
       <Grid container spacing={0} sx={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        <Grid size={3} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
          <Paper sx={{ height: '100%', width: '100%' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', height: '100%' }}>
              <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
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
              </Box>
              <LinearProgress variant="determinate" value={loadProgress} />{/* 進捗バー */}
              <List dense sx={{ width: '100%', flex: 1, overflowY: 'auto', mt: 1 }}>
                {folderList.length === 0 && (
                  <ListItem>
                    <ListItemText primary="選択された項目はありません" />
                  </ListItem>
                )}
                {folderList.length > 0 && (
                  <>
                    <ListItem sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={`選択中フォルダ: ${selectedFolder || '(未選択)'}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        onClick={() => onSelectFolder(selectedFolder)}
                      />
                    </ListItem>
                    <Divider />
                    {selectedFolder && (folderMap?.[selectedFolder]?.length || 0) > 0 && (
                      <>
                        <Divider sx={{ my: 0.5 }} />
                        {folderMap[selectedFolder].map((file) => (
                          <ListItem key={file.webkitRelativePath || file.name} sx={{ pl: 2 }}>
                            <ListItemText
                              primary={file.name}
                              secondary={`${(file.size / 1024).toFixed(1)} KB`}
                              secondaryTypographyProps={{ variant: 'caption' }}
                            />
                          </ListItem>
                        ))}
                      </>
                    )}
                  </>
                )}
              </List>
            </Box>
          </Paper>
        </Grid>
        <Grid size={9} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
          <Paper sx={{ height: '100%', width: '100%' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                <ToggleButtonGroup
                  size="medium" color="primary" value={selectedTool} exclusive onChange={handleToolGroupChange}
                >
                  {toolsButtons}{/* ツールボタン群 */}
                </ToggleButtonGroup>
                <ToggleButtonGroup
                  size="medium" color="secondary" value={colorMap} exclusive onChange={onChangeColorMap}
                  sx={{ ml: 1 }}
                >
                  <Tooltip title="カラー表示: 擬似カラーを適用" arrow>
                    <ToggleButton value="color">
                      <PaletteIcon />
                    </ToggleButton>
                  </Tooltip>
                  <Tooltip title="グレースケール: 白黒表示に切り替え" arrow>
                    <ToggleButton value="grayscale">
                      <InvertColorsOffIcon />
                    </ToggleButton>
                  </Tooltip>
                </ToggleButtonGroup>
                <Tooltip title="レイアウトを初期状態にリセット" arrow>
                  <ToggleButton size="medium" value="reset" disabled={!dataLoaded} onChange={onReset}>
                    <RefreshIcon />
                  </ToggleButton>
                </Tooltip>

                <Tooltip title="断面の切替 (axial ⇄ coronal ⇄ sagittal)" arrow>
                  <ToggleButton size="medium" value="toggleOrientation" disabled={!dataLoaded} onClick={toggleOrientation}>
                    <CameraswitchIcon />
                  </ToggleButton>
                </Tooltip>

                <Tooltip title="DICOMタグを表示" arrow>
                  <ToggleButton size="medium" value="tags" disabled={!dataLoaded} onClick={handleTagsDialogOpen}>
                    <LibraryBooksIcon />
                  </ToggleButton>
                </Tooltip>

                <Dialog
                  open={showDicomTags} onClose={handleTagsDialogClose} TransitionComponent={TransitionUp}
                >
                  <AppBar className={classes.appBar} position="sticky">
                    <Toolbar>
                      <IconButton color="inherit" onClick={handleTagsDialogClose} aria-label="Close"><CloseIcon /></IconButton>
                      <Typography variant="h6" color="inherit" sx={{ flex: 1 }}>DICOM Tags</Typography>
                    </Toolbar>
                  </AppBar>
                  <TagsTable data={metaData} />{/* メタデータテーブル */}
                </Dialog>
              </Box>
              <Box sx={{ height: '100%', width: '100%', overflow: 'hidden',}}>
                <div id="layerGroup0" className="layerGroup"></div>
              </Box>
            </Box>
          </Paper>
        </Grid>
       </Grid>
    </Root>
  );
};

// 既定エクスポート
export default DwvComponent; // 関数コンポーネントを公開
