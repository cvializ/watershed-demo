#include <common>

varying vec2 vUv;

void main() {
    vUv = uv;
    #include <begin_vertex>
    #include <project_vertex>
}