// UI部品（MUI）をインポート
import {
  Box, InputAdornment, Paper, Slider, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField
} from '@mui/material'; // 表や入力
import { styled } from '@mui/material/styles'; // スタイルユーティリティ
import React, { useCallback, useMemo, useState } from 'react'; // フック群

// DICOMタグ辞書ヘルパ
import { getTagFromKey } from 'dwv'; // タグキー→人名解決

// 検索アイコン
import Search from '@mui/icons-material/Search'; // 先頭アイコン

// CSSクラス接頭辞
const PREFIX = 'TagsTable'; // 名前空間
// クラス名まとめ
const classes = {
  flex: `${PREFIX}-flex`,           // 伸縮スペーサ
  spacer: `${PREFIX}-spacer`,       // 余白
  searchField: `${PREFIX}-searchField`, // 検索入力幅
  slider: `${PREFIX}-slider`,       // スライダ余白
  container: `${PREFIX}-container`  // ルート
};

// スコープドスタイル
const Root = styled('div')(({ theme }) => ({ // ルート用
  [`& .${classes.flex}`]: { flex: 1 },                 // 伸縮
  [`& .${classes.spacer}`]: { flex: '1 1 100%' },      // 余白
  [`& .${classes.searchField}`]: { width: '45%' },     // 入力幅
  [`& .${classes.slider}`]: { margin: 20 },            // 余白
  [`&.${classes.container}`]: { padding: 10, overflow: 'hidden' } // 内側余白
}));

// 関数コンポーネント
const TagsTable = ({ data }) => { // props: data=全メタ
  // propsから初期メタを受け取る（undefined対策）
  const fullMetaData = data || {}; // 空オブジェクトでガード

  // DICOMメタかどうかを判定
  const isDicomMeta = useMemo(() => typeof fullMetaData['00020010'] !== 'undefined', [fullMetaData]); // FileMeta有無

  // InstanceNumber配列を抽出（なければ空）
  const instanceNumbers = useMemo(() => { // スライダ候補
    const el = fullMetaData['00200013']; // InstanceNumberタグ
    if (typeof el === 'undefined') return []; // なし
    let vals = el.value; // 値（配列/文字列）
    if (typeof vals === 'string') vals = [vals]; // 文字列→配列
    const nums = vals.map(Number).filter((v) => !Number.isNaN(v)); // 数値化
    nums.sort((a, b) => a - b); // 昇順
    return nums; // 返却
  }, [fullMetaData]); // 依存

  // スライダの最小/最大インデックス
  const sliderMin = 0;                           // 最小インデックス
  const sliderMax = Math.max(0, instanceNumbers.length - 1); // 最大インデックス

  // 現在のスライダ位置（インデックス）と対応する実InstanceNumber
  const [sliderIndex, setSliderIndex] = useState(sliderMin);  // インデックス
  const instanceNumber = instanceNumbers.length ? instanceNumbers[sliderIndex] : 0; // 実値

  // 検索語
  const [searchfor, setSearchfor] = useState(''); // 小文字比較用

  // DICOMでない場合の reduce（key/valueフラット化）
  const reducePlainTags = useCallback((tagData) => (acc, key) => { // 平坦化
    acc.push({ name: key, value: tagData[key].value }); // 1行追加
    return acc; // 蓄積を返す
  }, []); // 依存なし

  // DICOMのタグを再帰的にフラットにする reducer を生成
  const reduceDicomTags = useCallback((tagData, instNum, prefix = '') => { // 再帰reducer
    // reducer本体（keys.reduceに渡す関数）を返す
    const reducer = (acc, key) => { // 1タグ処理
      const tag = getTagFromKey(key); // キー→タグ情報
      let name = tag.getNameFromDictionary(); // 人が読める名前
      if (typeof name === 'undefined') name = 'x' + tag.getKey(); // 未知タグはキー
      const el = tagData[key]; // 要素
      let val = el.value; // 値（配列/TypedArrayの可能性）
      // Multi-value（TypedArray含む）かつインスタンスごと値がある場合
      if (typeof val !== 'string' && typeof val !== 'number' &&
          typeof val?.slice === 'undefined' && typeof val?.[instNum] !== 'undefined') {
        val = val[instNum]; // 指定インスタンスの値
      }
      // InstanceNumber表示は現在の値に合わせる
      if (name === 'InstanceNumber') val = instNum;
      // シーケンス（SQ）は再帰展開
      if (el.vr === 'SQ') {
        acc.push({ name: (prefix ? prefix + ' ' : '') + name, value: '' }); // セクション見出し
        for (let i = 0; i < val.length; ++i) { // 各itemを処理
          const child = val[i];                    // 子要素の集合
          const keys = Object.keys(child);        // 子のキー一覧
          const childReducer = reduceDicomTags(child, instNum, `${prefix}[${i}]`); // 子reducer
          const rows = keys.reduce(childReducer, []); // 子要素を平坦化
          acc = acc.concat(rows);                 // 結果に連結
        }
      } else {
        // Other系の巨大データは先頭だけ
        if (el.vr?.[0] === 'O' && val?.length > 10) {
          val = val.slice(0, 10).toString() + `... (len:${val.length})`; // 先頭のみ
        }
        acc.push({ name: (prefix ? prefix + ' ' : '') + name, value: String(val) }); // 1行
      }
      return acc; // 返却
    };
    return reducer; // reducerを返す
  }, []); // 依存なし

  // 現在インスタンスに対するフラットなタグ配列を得る
  const metaArray = useMemo(() => { // 表示用配列
    const keys = Object.keys(fullMetaData); // ルートキー一覧
    if (!keys.length) return []; // 空なら空配列
    if (isDicomMeta) { // DICOMメタのとき
      const reducer = reduceDicomTags(fullMetaData, instanceNumber, ''); // 再帰reducer
      return keys.reduce(reducer, []); // 平坦化
    }
    const reducer = reducePlainTags(fullMetaData); // プレーン
    return keys.reduce(reducer, []); // 平坦化
  }, [fullMetaData, isDicomMeta, instanceNumber, reduceDicomTags, reducePlainTags]); // 依存

  // 検索語でフィルタした配列を作る
  const displayData = useMemo(() => { // 表示配列(フィルタ後)
    const needle = searchfor.toLowerCase(); // 小文字
    if (!needle) return metaArray; // 空検索ならそのまま
    return metaArray.filter((row) => { // 各行を判定
      const n = String(row.name || '').toLowerCase();   // name小文字
      const v = String(row.value || '').toLowerCase();  // value小文字
      return n.includes(needle) || v.includes(needle);  // どちらか含む
    });
  }, [metaArray, searchfor]); // 依存

  // スライダ変更（MUIのonChangeは (e, value) で来る）
  const onSliderChange = useCallback((e, value) => { // スライダ変更
    if (typeof value === 'number') setSliderIndex(value); // インデックス更新
  }, []); // 依存なし

  // 検索入力変更
  const onSearch = useCallback((e) => { setSearchfor(e.target.value); }, []); // 文字列更新

  // JSX（表と検索UI）
  return (
    <Root className={classes.container}>{/* ルート */}
      <Stack direction="row" spacing={2}>{/* 上段: 検索とスライダ */}
        <TextField
          id="search" type="search" value={searchfor} className={classes.searchField}
          onChange={onSearch} margin="normal" size="small"
          slotProps={{ input: { startAdornment: (<InputAdornment position="start"><Search /></InputAdornment>) } }}
        />
        <Box width={300} display="flex" alignItems="center">{/* スライダと現在値 */}
          <Slider
            title="Instance number" className={classes.slider} marks
            min={sliderMin} max={sliderMax} value={sliderIndex} onChange={onSliderChange}
          />
          <div title="Instance number">{instanceNumber}</div>{/* 現在の実値 */}
        </Box>
      </Stack>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>{/* 表コンテナ */}
        <TableContainer sx={{ maxHeight: 400 }}>{/* スクロールable領域 */}
          <Table stickyHeader>{/* ヘッダ固定テーブル */}
            <TableHead>
              <TableRow>
                <TableCell>Tag</TableCell>{/* タグ名 */}
                <TableCell>Value</TableCell>{/* 値 */}
              </TableRow>
            </TableHead>
            <TableBody>
              {displayData.map((item, idx) => ( // 各行レンダ
                <TableRow key={idx}>
                  <TableCell>{item.name}</TableCell>{/* 名前 */}
                  <TableCell>{item.value}</TableCell>{/* 値 */}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Root>
  );
};

// 既定エクスポート
export default TagsTable; // 関数コンポーネントを公開
