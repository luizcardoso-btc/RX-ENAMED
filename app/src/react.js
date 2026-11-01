// React vem do CDN (UMD) como variável global; os módulos importam os hooks daqui.
export const {
  useState, useEffect, useMemo, useRef, useCallback, useReducer, useContext, createContext, Fragment,
} = window.React;
