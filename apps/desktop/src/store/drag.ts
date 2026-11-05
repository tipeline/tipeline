// stores/dragStore.js
import { defineStore } from 'pinia'

export const useDragStore = defineStore('drag', {
  state: () => ({
    items : [
      {
        id: 2,
        title: 'Level 0 - A0',
        children: [
          { id: 21, title: 'Level 1 - A1', children: [] },
          { id: 22, title: 'Level 1 - A2', children: [] },
        ],
      },
      { id: 3, title: 'Level 0 - B0', children: [] }
    ],
    draggedItem: null,
    isDragging: false
  }),
  actions: {
    startDrag(item:any) {
      this.draggedItem = item
      this.isDragging = true
    },
    endDrag() {
      this.draggedItem = null
      this.isDragging = false
    }
  }
})