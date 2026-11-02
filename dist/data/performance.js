window.GPU_PERFORMANCE = [
  {
    id: 'roofline', title: 'The roofline: calculate your bottleneck', group: 'Performance', level: 'Intermediate', minutes: 40,
    summary: 'Turn FLOPs, bytes, and elapsed time into an optimization hypothesis you can test.',
    tags: ['roofline', 'bandwidth', 'arithmetic intensity', 'FLOPS'],
    objectives: ['Calculate arithmetic intensity with consistent units.', 'Distinguish theoretical ceilings from measured performance.', 'Choose an optimization that addresses the limiting resource.'],
    sections: [
      { heading: 'Start with work and traffic', body: 'Arithmetic intensity I is useful floating-point work divided by bytes transferred at a specified memory boundary: FLOP/byte. Achieved performance P is work divided by elapsed seconds: FLOP/s. A multiply-add conventionally counts as two FLOPs. Name the boundary: traffic between HBM and L2 differs from traffic between L2 and an SM. Algorithmic minimum bytes are a model; hardware counters reveal actual transactions, cache reuse, and unnecessary transfers.' },
      { heading: 'Read the two ceilings', body: 'The basic roofline is P ≤ min(Ppeak, B × I), where B is bytes per second. Its ridge occurs at I* = Ppeak/B. In an illustrative machine with 100 TFLOP/s and 2 TB/s, the ridge is 50 FLOP/byte. A kernel at 10 FLOP/byte has a bandwidth ceiling of 20 TFLOP/s. Use matching decimal prefixes or convert everything to base units; GiB and GB are different quantities.' },
      { heading: 'Select an honest compute roof', body: 'A GPU has several compute ceilings, depending on instruction family, datatype, accumulation mode, and sparsity. Comparing ordinary FP32 instructions against a sparse low-precision Tensor Core marketing number produces a meaningless efficiency percentage. Published peaks are useful upper bounds. Measured sustained bandwidth and a well-tuned dense matrix multiplication give more realistic local reference points, provided you record precision, shapes, clocks, power state, and software versions.' },
      { heading: 'Reason about common operators', body: 'A float32 vector addition needs two input reads and one output write: approximately 12 bytes for one addition, or 1/12 FLOP/byte, assuming no useful cache residency. Dense matrix multiplication performs about 2MNK FLOPs. Tiling lets one loaded value contribute to many outputs, raising reuse. These estimates describe tendencies. Small matrices, unusual strides, boundary tiles, and repeated cached inputs can make a measured workload behave differently.' },
      { heading: 'Explain the gap below the roof', body: 'A point below a roof does not prove that more bandwidth or more arithmetic units will help. Launch latency, dependencies, insufficient parallelism, uncoalesced accesses, register spills, synchronization, or unfavorable instruction mixes can dominate. Start with a timeline to identify expensive kernels, then inspect their counters. A memory-side classification describes a possible limiting ceiling; it is not evidence that the kernel already saturates that resource.' },
      { heading: 'Make a falsifiable optimization', body: 'If excessive HBM traffic dominates, try fusion, reuse, or a smaller representation. If compute throughput dominates, examine Tensor Core eligibility and tile shape. Predict the expected byte or work change before editing code. Recheck numerical correctness and end-to-end latency afterward. A faster isolated kernel can have negligible application impact when preprocessing dominates; use the fraction of total runtime affected to bound the possible overall speedup.' }
    ],
    lab: {
      title: 'Measure a vector-add reference point',
      steps: ['On Linux with an NVIDIA GPU and CUDA-enabled PyTorch, save the Python below as roofline_lab.py. Allow at least 1 GiB of free device memory.', 'Run it outside other GPU workloads. Repeat with several tensor sizes and record the device, datatype, and median result.', 'Treat the reported bandwidth as an algorithmic traffic estimate. Use Nsight Compute memory counters to determine whether reads came from HBM or cache.', 'Compare the point with a compatible sustained bandwidth measurement; do not compare it to Tensor Core peak FLOPs.'],
      code: `import statistics
import torch

assert torch.cuda.is_available(), "CUDA-enabled PyTorch and an NVIDIA GPU required"
n = 1 << 24
a = torch.rand(n, device="cuda")
b = torch.rand_like(a)
c = torch.empty_like(a)
for _ in range(10):
    torch.add(a, b, out=c)
torch.cuda.synchronize()
samples = []
for _ in range(20):
    start = torch.cuda.Event(enable_timing=True)
    end = torch.cuda.Event(enable_timing=True)
    start.record()
    torch.add(a, b, out=c)
    end.record()
    end.synchronize()
    samples.append(start.elapsed_time(end) / 1000)
seconds = statistics.median(samples)
print(torch.cuda.get_device_name())
print(f"Median: {seconds * 1000:.3f} ms")
print(f"Intensity: {1/12:.4f} FLOP/byte")
print(f"Estimated traffic rate: {12*n/seconds/1e9:.1f} GB/s")
print(f"Achieved work: {n/seconds/1e9:.1f} GFLOP/s")`,
      success: 'Explain your point using consistent units and distinguish estimated minimum traffic from measured HBM traffic. The guide does not supply a claimed benchmark result.'
    },
    quiz: { question: 'A 120 TFLOP/s compute roof and 3 TB/s bandwidth roof meet at what arithmetic intensity?', choices: ['0.025 FLOP/byte', '40 FLOP/byte', '360 FLOP/byte', '40 FLOP/s'], answer: 1, explanation: 'The ridge is compute throughput divided by bandwidth: 120 × 10¹² / (3 × 10¹²) = 40 FLOP/byte.' },
    sources: [{ label: 'NERSC: roofline performance model', url: 'https://docs.nersc.gov/tools/performance/roofline/' }, { label: 'NVIDIA: Nsight Compute profiling guide', url: 'https://docs.nvidia.com/nsight-compute/ProfilingGuide/' }, { label: 'NVIDIA: CUDA best practices', url: 'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html' }]
  },
  {
    id: 'profiling', title: 'Measure first: events, timelines, and counters', group: 'Performance', level: 'Intermediate', minutes: 45,
    summary: 'Build trustworthy benchmarks and move from application symptoms to specific kernel causes.',
    tags: ['Nsight Systems', 'Nsight Compute', 'CUDA events', 'PyTorch profiler'],
    objectives: ['Measure asynchronous GPU work correctly.', 'Choose a timeline or kernel profiler for a specific question.', 'Produce a repeatable before-and-after performance report.'],
    sections: [
      { heading: 'Define the quantity before timing', body: 'Kernel execution time, training-step time, request latency, and steady-state throughput answer different questions. Define whether a measurement includes data loading, host-to-device copies, compilation, graph capture, tokenization, and output transfer. Preserve a representative workload: shapes, padding, concurrency, and sequence lengths all matter. A tiny synthetic benchmark is useful for diagnosis, but its success must survive a realistic application benchmark before becoming a deployment claim.' },
      { heading: 'Respect asynchronous execution', body: 'CUDA launches normally return before device work completes. A host stopwatch wrapped around a launch may measure dispatch rather than execution. For a single-stream GPU region, record timing-enabled CUDA events before and after the region and synchronize the ending event before reading elapsed time. For total host-observed latency, synchronize before starting and after finishing the timed region. Events across streams need explicit dependency reasoning.' },
      { heading: 'Warm up and separate cold start', body: 'Initial iterations can include CUDA context creation, allocator growth, library autotuning, JIT compilation, and cache population. Warm the exact shape and execution path before reporting steady state. Also measure cold start separately when it matters to users. Collect multiple samples and report median and spread; avoid silently selecting the fastest run. Record competing processes, device temperature, power limits, and versions so another engineer can reproduce the conditions.' },
      { heading: 'Use the timeline to locate idle time', body: 'Nsight Systems connects CPU threads, CUDA API calls, kernels, memory copies, and synchronization on a common timeline. Look for GPU gaps, serialized transfers, excessive tiny launches, and CPU stalls. NVTX ranges make phases such as loading, forward, backward, and optimizer update recognizable. Start with a short representative capture. Ask what prevents the next useful operation from starting; aggregate utilization alone rarely explains that dependency.' },
      { heading: 'Use counters to explain a hotspot', body: 'Nsight Compute investigates individual kernels with instruction, memory, occupancy, and roofline measurements. Narrow collection to the relevant launch and question because replay and instrumentation can disturb normal execution. PyTorch Profiler provides operator-level attribution and can expose shapes or memory use when enabled, with extra overhead. Summed kernel durations are not automatically wall-clock duration when kernels overlap. Compare uninstrumented runs before accepting a speedup.' },
      { heading: 'Write the performance argument', body: 'A useful report states the symptom, trace evidence, causal hypothesis, change, and measured outcome. Include correctness criteria and a counterexample workload that could regress. For example, reducing launch count may help small batches while extra temporary storage harms large batches. Retain the baseline, raw timings, and environment manifest. Separate observation from inference: a long gap is observed; blaming the data loader requires evidence about the host work during that gap.' }
    ],
    lab: {
      title: 'Create a reproducible matrix-multiply trace',
      steps: ['Save the Python as profile_lab.py in a Linux CUDA-enabled PyTorch environment. Start with its small matrix shape.', 'Run python profile_lab.py to collect an uninstrumented timing, followed by a separate PyTorch capture in trace.json.', 'If installed, run nsys profile --trace=cuda,nvtx,osrt -o matmul python profile_lab.py --external and inspect the timeline. The flag disables the internal CUDA profiler to avoid competing CUPTI subscribers.', 'Use ncu --set basic --launch-count 3 python profile_lab.py --external for a first kernel view. Run each profiler separately; performance-counter access may require an administrator.'],
      code: `import argparse
import statistics
import torch

parser = argparse.ArgumentParser()
parser.add_argument("--external", action="store_true",
                    help="Leave CUDA profiling to an external Nsight tool")
args = parser.parse_args()
assert torch.cuda.is_available()
x = torch.randn(1024, 1024, device="cuda")
for _ in range(20):
    y = x @ x
torch.cuda.synchronize()
times = []
for _ in range(30):
    a = torch.cuda.Event(enable_timing=True)
    b = torch.cuda.Event(enable_timing=True)
    a.record()
    y = x @ x
    b.record()
    b.synchronize()
    times.append(a.elapsed_time(b))
print("Median GPU region, ms:", statistics.median(times))
if args.external:
    print("Internal CUDA profiler disabled; timings include external tool overhead.")
else:
    from torch.profiler import profile, ProfilerActivity, record_function
    with profile(activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
                 record_shapes=True) as p:
        for _ in range(3):
            with record_function("measured_matmul"):
                y = x @ x
        torch.cuda.synchronize()
    p.export_chrome_trace("trace.json")
    print(p.key_averages().table(sort_by="self_cuda_time_total", row_limit=8))`,
      success: 'Identify a CPU launch, its GPU kernel, and the measurement boundary in your trace. Explain why profiler timings may differ from the uninstrumented median.'
    },
    quiz: { question: 'Why can a Python timer around x @ x substantially underestimate GPU execution time?', choices: ['Python always subtracts GPU time', 'Matrix multiplication has no launch cost', 'The launch can return before the GPU finishes', 'GPU clocks are measured in seconds only'], answer: 2, explanation: 'GPU work is asynchronous with respect to the host. Synchronize appropriate boundaries or use CUDA events with a completed end event.' },
    sources: [{ label: 'PyTorch: profiler recipe', url: 'https://docs.pytorch.org/tutorials/recipes/recipes/profiler_recipe.html' }, { label: 'NVIDIA: Nsight Systems user guide', url: 'https://docs.nvidia.com/nsight-systems/UserGuide/index.html' }, { label: 'PyTorch: CUDA Event API', url: 'https://docs.pytorch.org/docs/main/generated/torch.cuda.Event.html' }]
  },
  {
    id: 'kernels-triton', title: 'Fusion and tiled kernels with Triton', group: 'Performance', level: 'Advanced', minutes: 65,
    summary: 'Understand why custom kernels win, when they lose, and how to validate every boundary.',
    tags: ['Triton', 'fusion', 'tiling', 'masking', 'correctness'],
    objectives: ['Explain fusion as reduced traffic and launch count.', 'Describe tiled matrix multiplication and resource tradeoffs.', 'Validate a masked Triton kernel against a reference.'],
    sections: [
      { heading: 'Choose a reason to write a kernel', body: 'Start with a mature framework operator or vendor library. A custom kernel is justified when a profile shows a valuable pattern the existing path handles poorly: several simple elementwise operations, an unusual layout, or a useful fused epilogue. State the opportunity in bytes, launches, or redundant arithmetic. Owning a kernel also means owning correctness, supported shapes, numerical behavior, compiler compatibility, and performance across deployed GPU architectures.' },
      { heading: 'Fusion removes intermediate movement', body: 'For y = relu(x + bias), separate kernels can materialize an intermediate tensor in device memory and incur multiple launches. A fused kernel can keep intermediate values in registers and store only the result. Fusion is not free: larger live state increases register demand, and a complex kernel can lose parallelism or prevent a faster library path. Measure the complete operation, including any new layout conversions or temporary allocations.' },
      { heading: 'Tile matrix multiplication for reuse', body: 'A matrix multiplication kernel computes an output tile by iterating over K tiles, loading fragments of A and B, and accumulating partial products. Reusing those fragments across outputs reduces memory traffic. Block dimensions, warps, pipeline stages, and traversal order affect occupancy and locality. Larger tiles improve reuse until registers, shared memory, or parallelism become limiting. FP32 accumulation can improve numerical accuracy for low-precision operands without making results identical to a full-FP32 reference.' },
      { heading: 'Masks are part of the algorithm', body: 'Real dimensions are seldom exact multiples of a chosen block. Every load and store must handle partial tiles without reading or writing outside valid storage. Masked reduction inputs need the correct neutral value: zero for a sum and negative infinity for a maximum in a stable softmax. Strides are also semantic inputs; assuming contiguous memory when passed a transposed tensor can produce plausible but wrong answers.' },
      { heading: 'Validate before tuning', body: 'Test tiny tensors, odd sizes, zeros, negative values, extreme magnitudes, and noncontiguous inputs if the contract promises them. Use appropriate absolute and relative tolerances, and consider NaN or infinity behavior. Check gradients separately for a training operator; a correct forward pass does not create a correct backward pass automatically. Keep a simple reference and deterministic seeds. A passing example on one aligned size is a smoke check, not a correctness argument.' },
      { heading: 'Tune for the workload distribution', body: 'Compile and warm each candidate before timing. Sweep representative shapes and dtypes rather than optimizing one convenient matrix. Autotuning costs can matter for cold requests and dynamic shapes. Record the winning configuration with the hardware and compiler versions. Promote a kernel only when it improves the application metric and preserves supported semantics. On unfamiliar hardware, retain a tested fallback so a specialized optimization does not become an availability failure.' }
    ],
    lab: {
      title: 'Write and validate a fused add–ReLU',
      steps: ['Use Linux with an NVIDIA GPU, CUDA-enabled PyTorch, and a compatible Triton package. Save the code as fused_lab.py.', 'Run the contiguous float32 smoke checks, including a size that is not divisible by 256.', 'Extend tests to extreme values and document the NaN contract before using this kernel in a real model.', 'Benchmark warmed kernels with CUDA events against torch.relu(x + y), then compare with torch.compile for the same expression.'],
      code: `import torch
import triton
import triton.language as tl

@triton.jit
def fused_add_relu(X, Y, Z, N: tl.constexpr, BLOCK: tl.constexpr):
    i = tl.program_id(0) * BLOCK + tl.arange(0, BLOCK)
    valid = i < N
    x = tl.load(X + i, mask=valid, other=0)
    y = tl.load(Y + i, mask=valid, other=0)
    z = tl.maximum(x + y, 0)
    tl.store(Z + i, z, mask=valid)

assert torch.cuda.is_available()
torch.manual_seed(0)
for n in (1, 255, 256, 257, 100003):
    x = torch.randn(n, device="cuda", dtype=torch.float32)
    y = torch.randn_like(x)
    z = torch.empty_like(x)
    fused_add_relu[(triton.cdiv(n, 256),)](x, y, z, n, 256)
    torch.testing.assert_close(z, torch.relu(x + y))
    print("Passed finite contiguous float32 case:", n)`,
      success: 'All supported smoke cases match the reference. Explain the mask, the reduced intermediate traffic, and the limitations of this forward-only contiguous-tensor example.'
    },
    quiz: { question: 'What is the safest way to handle the final partial block of a vector kernel?', choices: ['Assume the allocation has spare bytes', 'Remove the final block from the grid', 'Mask all out-of-range loads and stores', 'Round the logical tensor size up without initialization'], answer: 2, explanation: 'The last block must compute valid elements while preventing invalid accesses. The loaded fallback value must match the operation’s mathematical needs.' },
    sources: [{ label: 'Triton: vector addition and masks', url: 'https://triton-lang.org/main/getting-started/tutorials/01-vector-add.html' }, { label: 'Triton: fused softmax', url: 'https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html' }, { label: 'Triton: tiled matrix multiplication', url: 'https://triton-lang.org/main/getting-started/tutorials/03-matrix-multiplication.html' }]
  },
  {
    id: 'training-memory', title: 'Fit training into one GPU', group: 'Performance', level: 'Intermediate', minutes: 50,
    summary: 'Account for every memory category and choose the right tradeoff when a training step does not fit.',
    tags: ['VRAM', 'Adam', 'AMP', 'checkpointing', 'LoRA'],
    objectives: ['Build a memory estimate with explicit dtype assumptions.', 'Distinguish persistent model state from activations and temporary workspaces.', 'Compare mixed precision, checkpointing, microbatches, and LoRA.'],
    sections: [
      { heading: 'Build a memory ledger', body: 'Training memory includes parameters, gradients, optimizer state, saved activations, temporary workspaces, and allocator overhead. For a specific example with FP32 parameters, FP32 gradients, and two FP32 Adam moment tensors, persistent state is roughly 16 bytes per parameter after optimizer initialization. That is an assumption-based estimate, not a universal law. Some mixed-precision schemes add master weights; others retain FP32 parameters and autocast selected operations. Inspect the actual tensors.' },
      { heading: 'Find the peak, not just the model size', body: 'Activations grow with microbatch size, sequence length, hidden width, and the intermediates saved for backward. Attention implementations can change this scaling substantially. Peak usage may occur during backward or the optimizer update rather than immediately after loading weights. Measure after a complete warm training step because optimizer state can initialize lazily. Allocated tensor memory, allocator-reserved memory, and the device-wide usage reported by a management tool are different quantities.' },
      { heading: 'Use mixed precision deliberately', body: 'Autocast chooses operation-specific dtypes; it does not simply divide the entire training footprint by two. FP16 has a narrower exponent range than BF16, so gradient scaling is commonly used with FP16 to reduce underflow risk. BF16 availability and efficient execution depend on the GPU and software stack. Watch loss curves and finite gradients, and compare with a trusted baseline. Precision is a numerical choice as well as a memory and speed choice.' },
      { heading: 'Trade recomputation for saved activations', body: 'Activation checkpointing avoids keeping selected forward intermediates and recomputes them during backward. It reduces activation memory while increasing computation, with the tradeoff depending on segment boundaries and operator costs. Use the documented checkpoint API and specify the implementation mode explicitly. Randomness, mutable state, side effects, and different forward-versus-recompute behavior can break equivalence. Checkpointing is different from saving a training checkpoint to disk for recovery.' },
      { heading: 'Microbatches and adapters target different costs', body: 'Gradient accumulation combines multiple microbatches before an optimizer step, reducing activation peaks while approximating a larger effective batch. Scale loss appropriately, and account for differences in batch-dependent layers and scheduling. LoRA freezes base weights and trains low-rank adapter matrices, reducing trainable parameters, gradients, and optimizer state. It does not remove base-weight storage or all activation costs. Quantizing a frozen base adds another memory-versus-accuracy and kernel-support decision.' },
      { heading: 'Diagnose an out-of-memory event', body: 'Record the failing phase, requested allocation, live tensors, and maximum allocated and reserved memory. Look for retained computation graphs, growing lists of tensors, accidentally enabled gradients during evaluation, and shape changes before blaming fragmentation. Reducing the microbatch is a useful diagnostic, not always the best final fix. Keep headroom for realistic long sequences and temporary buffers. A run that barely fits a synthetic example is not a reliable capacity plan.' }
    ],
    lab: {
      title: 'Measure checkpointing’s memory tradeoff',
      steps: ['Use CUDA-enabled PyTorch on Linux and an NVIDIA GPU with at least roughly 2 GiB free; reduce width or batch size if needed.', 'Save the code as memory_lab.py, run it, and compare peak allocated memory with and without activation checkpointing.', 'Add CUDA-event timing after warmup to quantify the recomputation cost. Do not assume checkpointing must be faster.', 'Repeat at two batch sizes and write a ledger explaining which categories changed.'],
      code: `import gc
import torch
from torch.utils.checkpoint import checkpoint

assert torch.cuda.is_available()
def measure(use_checkpoint):
    torch.manual_seed(0)
    model = torch.nn.Sequential(*[
        torch.nn.Sequential(torch.nn.Linear(1024, 1024), torch.nn.GELU())
        for _ in range(6)
    ]).cuda()
    opt = torch.optim.AdamW(model.parameters())
    x = torch.randn(512, 1024, device="cuda")
    def step():
        opt.zero_grad(set_to_none=True)
        y = x
        for block in model:
            y = checkpoint(block, y, use_reentrant=False) if use_checkpoint else block(y)
        y.square().mean().backward()
        opt.step()
    step()  # Initialize optimizer state and kernels.
    opt.zero_grad(set_to_none=True)
    torch.cuda.synchronize()
    torch.cuda.reset_peak_memory_stats()
    step()
    torch.cuda.synchronize()
    print("checkpoint=", use_checkpoint,
          "peak allocated MiB=", torch.cuda.max_memory_allocated() / 2**20)
    del opt, model, x
    gc.collect()
    torch.cuda.empty_cache()

measure(False)
measure(True)`,
      success: 'Produce measured peak-memory values and explain why the difference depends on batch size, operator intermediates, and checkpoint placement. No GPU result is preclaimed.'
    },
    quiz: { question: 'For FP32 parameters, FP32 gradients, and two FP32 Adam moments, what is the approximate persistent state per parameter?', choices: ['4 bytes', '8 bytes', '16 bytes', 'Exactly 32 bytes for every training framework'], answer: 2, explanation: 'There are four assumed 4-byte values: parameter, gradient, first moment, and second moment. Activations, workspaces, allocator overhead, and alternative precision schemes change total memory.' },
    sources: [{ label: 'PyTorch: automatic mixed precision', url: 'https://docs.pytorch.org/docs/main/amp.html' }, { label: 'PyTorch: activation checkpointing', url: 'https://docs.pytorch.org/docs/main/utils/checkpoint.html' }, { label: 'Hugging Face PEFT: LoRA concepts', url: 'https://huggingface.co/docs/peft/main/en/conceptual_guides/lora' }]
  },
  {
    id: 'input-pipeline', title: 'Keep the GPU fed', group: 'Performance', level: 'Intermediate', minutes: 40,
    summary: 'Trace the path from storage to compute and distinguish asynchronous submission from real overlap.',
    tags: ['DataLoader', 'pinned memory', 'PCIe', 'streams', 'overlap'],
    objectives: ['Identify storage, CPU, transfer, and device bottlenecks separately.', 'Explain the conditions for host-to-device copy and compute overlap.', 'Tune loading without introducing lifetime or synchronization bugs.'],
    sections: [
      { heading: 'Treat loading as a pipeline', body: 'A batch travels through storage reads, decoding, augmentation or tokenization, collation, host memory, a device transfer, and GPU computation. Throughput is constrained by the slowest stage once the pipeline is full. Measure per-stage duration and queue occupancy. A busy CPU does not prove useful preprocessing, and a low GPU-utilization sample does not identify a cause. Compare real data against preloaded synthetic tensors to isolate the input path.' },
      { heading: 'Tune workers and buffering together', body: 'DataLoader worker processes can prepare batches while the training process executes GPU work. More workers can help until CPU cores, storage, memory bandwidth, or interprocess overhead become limiting. Prefetching and persistent workers trade extra host memory for fewer stalls and startup costs. Account for large Python objects copied or replicated into workers. Tune with realistic transforms and dataset access patterns; sequential synthetic arrays can hide the actual storage bottleneck.' },
      { heading: 'Understand pinned memory', body: 'Pinned host memory cannot be paged out and enables efficient DMA transfers. A DataLoader with pin_memory=True can provide pinned batches without manually pinning on the critical training thread. Pinned memory is a scarce host resource: excessive allocation can harm the rest of the system. Calling pin_memory on each batch immediately before copying can add enough work to erase the benefit. Measure the complete path rather than assuming a flag guarantees improvement.' },
      { heading: 'Asynchronous is not the same as overlapped', body: 'Using non_blocking=True can avoid a host-side wait, but copy and compute submitted to the same stream still follow stream order. Genuine device overlap generally needs pinned source memory, suitable copy-engine support, independent work in separate streams, and enough work to hide transfer latency. A compute stream must wait before consuming the copied batch. PCIe bandwidth and shared resource contention can limit gains even when overlap appears in a trace.' },
      { heading: 'Protect buffers across stream boundaries', body: 'Keep a pinned source alive and unchanged until its asynchronous transfer completes. Before the CPU reads a device-to-host result, ensure the transfer has finished. When tensors cross CUDA streams, establish dependencies with events or stream waits and ensure allocator lifetime tracking is correct, for example with record_stream when appropriate. Double buffering is a useful design: prepare the next batch while computing the current one, then exchange buffers only after the required events.' },
      { heading: 'Optimize the actual delivery contract', body: 'Measure samples or tokens per second together with step-time variance, host RAM, CPU usage, and GPU gaps. Faster average loading is insufficient if rare slow reads repeatedly starve the device. Preserve ordering, sharding, and reproducibility semantics while optimizing. Cache or preprocess expensive work when practical, and investigate small-file overhead or remote-storage latency. On a single GPU, this disciplined pipeline work often pays off before writing any custom compute kernel.' }
    ],
    lab: {
      title: 'Establish a pinned-loading baseline',
      steps: ['Save the script as pipeline_lab.py and run it as a file on Linux with CUDA-enabled PyTorch. The main guard is necessary for portable worker startup.', 'Compare num_workers=0 and num_workers=2, and compare pin_memory=False with True.', 'Measure full-epoch throughput after the first epoch and inspect a short Nsight Systems trace.', 'Explain why this baseline can overlap CPU loading with GPU execution but does not explicitly overlap a device copy with computation on another stream.'],
      code: `import time
import torch
from torch.utils.data import DataLoader, TensorDataset

def main():
    assert torch.cuda.is_available()
    dataset = TensorDataset(torch.randn(8192, 256))
    workers = 2  # Compare 0 and 2; persistence requires workers > 0.
    loader = DataLoader(dataset, batch_size=256, num_workers=workers,
                        pin_memory=True, persistent_workers=(workers > 0))
    weight = torch.randn(256, 256, device="cuda")
    for epoch in range(3):
        torch.cuda.synchronize()
        started = time.perf_counter()
        count = 0
        for (host_batch,) in loader:
            batch = host_batch.to("cuda", non_blocking=True)
            output = batch @ weight
            count += batch.shape[0]
        torch.cuda.synchronize()
        print(epoch, "samples/s:", count / (time.perf_counter() - started))

if __name__ == "__main__":
    main()`,
      success: 'Explain the bottleneck using a trace and throughput measurements. State whether CPU preparation, host-to-device copy, or GPU computation actually overlaps.'
    },
    quiz: { question: 'Does non_blocking=True alone guarantee that a host-to-device copy overlaps a preceding kernel in the same CUDA stream?', choices: ['Yes, on every CUDA GPU', 'No; operations in one stream remain ordered', 'Only when the tensor contains integers', 'Yes, if Python has two threads'], answer: 1, explanation: 'Nonblocking host submission and concurrent device execution are separate properties. Actual overlap requires suitable memory, hardware, stream placement, and independent work.' },
    sources: [{ label: 'PyTorch: data loading reference', url: 'https://docs.pytorch.org/docs/main/data.html' }, { label: 'PyTorch: pin_memory and non_blocking tutorial', url: 'https://docs.pytorch.org/tutorials/intermediate/pinmem_nonblock.html' }, { label: 'PyTorch: CUDA streams and memory semantics', url: 'https://docs.pytorch.org/docs/main/notes/cuda.html' }]
  },
  {
    id: 'llm-inference', title: 'Prefill, decode, and the KV-cache budget', group: 'Performance', level: 'Intermediate', minutes: 50,
    summary: 'Connect transformer execution to capacity, latency, throughput, and a user-visible serving objective.',
    tags: ['LLM', 'prefill', 'decode', 'KV cache', 'GQA', 'TTFT'],
    objectives: ['Explain why prefill and decode have different performance tendencies.', 'Calculate a dense-attention KV-cache budget with explicit assumptions.', 'Distinguish TTFT, TPOT, throughput, and goodput.'],
    sections: [
      { heading: 'Two phases share one device', body: 'Prefill processes prompt tokens and builds attention state. Decode generates subsequent tokens autoregressively, reusing earlier keys and values. Larger prefill workloads often expose substantial matrix-multiplication parallelism; low-batch decode often spends much of its time moving weights and cache data. These are tendencies, not universal rules. Prompt length, active batch size, cache reuse, model architecture, and kernel choice can change the limiting resource and the interference between phases.' },
      { heading: 'Derive the cache formula', body: 'For ordinary full-attention layers, uncompressed KV storage is approximately 2 × L × Hkv × Dhead × s × sum(Ti) bytes. L is layer count, Hkv is key/value head count, Dhead is head dimension, s is bytes per cached element, and Ti is the cached length of each active sequence. The leading two stores both keys and values. This excludes metadata, padding, quantization scales, allocator overhead, and temporary attention buffers.' },
      { heading: 'Account for architecture and allocation', body: 'Grouped-query attention shares key/value heads across multiple query heads, so use Hkv rather than the query-head count. Multi-query attention is the one-KV-head case. Sliding-window, hybrid, and latent-attention models need architecture-specific accounting. A static cache may reserve its full configured capacity; a paged cache allocates blocks and still incurs block rounding and metadata. Capacity planning must include weights and workspaces before assigning the remaining memory to concurrent requests.' },
      { heading: 'Separate latency measurements', body: 'Time to first token, TTFT, usually covers the interval from request submission until the client receives its first token, including queueing and prefill. State the exact measurement boundary. For N output tokens, average time per output token after the first is commonly (last-token time − first-token time)/(N − 1), when N > 1. Individual inter-token gaps reveal stalls that an average TPOT can hide. Track tail percentiles as well as medians.' },
      { heading: 'Optimize useful throughput', body: 'Specify whether tokens per second counts input tokens, output tokens, or both, and whether it is per request or across the server. Goodput adds a service requirement: for example, requests per second meeting both TTFT and TPOT limits. A larger batch may raise total output throughput while worsening interactive latency. Report offered load, accepted load, failures, cancellations, and output-length distribution so a benchmark cannot appear faster merely by serving easier or fewer requests.' },
      { heading: 'Design a capacity experiment', body: 'Sweep concurrent requests and realistic prompt/output length combinations while recording queue delay, cache occupancy, preemptions, and latency percentiles. Use an arrival process that resembles production, including bursts, rather than only a fixed saturated batch. Stop increasing load when the chosen service objective fails. The resulting capacity is conditional on model, precision, scheduling policy, hardware, and traffic mix; a single tokens-per-second number cannot summarize all of those dimensions.' }
    ],
    lab: {
      title: 'Build a transparent KV-cache estimate',
      steps: ['Run this CPU-only Python calculator before selecting a GPU; it does not need CUDA or model downloads.', 'Replace the illustrative architecture with the actual model configuration, especially num_key_value_heads and layer count.', 'Compare the idealized estimate with the serving engine’s observed cache allocation on your Linux NVIDIA host.', 'Explain any gap using static allocation, paged block rounding, reserved workspace, quantization metadata, or a different attention architecture.'],
      code: `# Illustrative dense full-attention model; not a named model specification.
layers = 32
kv_heads = 8
head_dim = 128
bytes_per_element = 2
sequence_lengths = [4096, 4096, 2048, 1024]
kv_bytes = (2 * layers * kv_heads * head_dim * bytes_per_element
            * sum(sequence_lengths))
print(f"Ideal KV payload: {kv_bytes / 2**30:.3f} GiB")
print(f"Bytes per cached token: {2*layers*kv_heads*head_dim*bytes_per_element:,}")

# Synthetic timestamps illustrate definitions, not measured server results.
submitted, first, last, output_tokens = 0.0, 0.45, 2.45, 101
ttft = first - submitted
tpot = (last - first) / (output_tokens - 1)
print(f"Illustrative TTFT: {ttft*1000:.0f} ms; TPOT: {tpot*1000:.0f} ms")`,
      success: 'Give an explicit byte estimate with architecture assumptions, then define a serving SLO using TTFT and TPOT rather than aggregate throughput alone.'
    },
    quiz: { question: 'A GQA model has 32 query heads and 8 KV heads. Which head count belongs in the ordinary KV-cache payload formula?', choices: ['32 query heads', '8 KV heads', '40 combined heads', 'The number of GPU SMs'], answer: 1, explanation: 'The cache stores keys and values, so its head dimension uses the KV-head count. Query heads do not each require an independent cached key/value copy in GQA.' },
    sources: [{ label: 'NVIDIA TensorRT-LLM: attention and KV-cache implementation', url: 'https://nvidia.github.io/TensorRT-LLM/advanced/gpt-attention.html' }, { label: 'Hugging Face Transformers: cache strategies', url: 'https://huggingface.co/docs/transformers/main/en/kv_cache' }, { label: 'vLLM: metrics definitions and measurement boundaries', url: 'https://docs.vllm.ai/en/latest/design/metrics/' }]
  },
  {
    id: 'inference-optimization', title: 'Choose inference optimizations by bottleneck', group: 'Performance', level: 'Advanced', minutes: 55,
    summary: 'Understand the benefits and costs of quantization, batching, CUDA graphs, efficient attention, and speculation.',
    tags: ['quantization', 'batching', 'CUDA graphs', 'FlashAttention', 'speculative decoding'],
    objectives: ['Match optimization techniques to measured bottlenecks.', 'Evaluate memory, numerical quality, latency, and throughput together.', 'Build a controlled experiment instead of stacking unverified flags.'],
    sections: [
      { heading: 'Quantization is a deployment choice', body: 'Weight-only quantization reduces weight storage and can reduce weight traffic during decode. Activation and KV-cache quantization target different memory and compute costs. Packed values need scales, sometimes zero points, and compatible kernels; nominal bits per weight do not describe total device memory. Smaller formats can be slower when dequantization or an unsupported fast path dominates. Validate model quality on representative tasks and check the exact GPU, engine, and format compatibility.' },
      { heading: 'Batching changes the latency contract', body: 'Batching amortizes weight reads and launches across requests, often improving device efficiency. Continuous batching admits and retires requests between decoding iterations so short requests need not wait for an entire fixed batch. Scheduling still creates tradeoffs: a long prefill can delay active decodes, while chunked prefill can balance progress across phases. Choose token budgets and concurrency from measured service objectives and available cache capacity, then retest bursty arrivals.' },
      { heading: 'CUDA graphs reduce repeated dispatch work', body: 'A CUDA graph records a reusable sequence of device operations so replay reduces host launch overhead. This is valuable when many small operations make dispatch significant. Capture imposes constraints on execution and memory addresses; changing shapes often requires bucketing, padding, recapture, or another execution path. Graph-associated memory can increase the footprint. Separate capture startup from replay timing and verify which requests actually take the graph path.' },
      { heading: 'Efficient attention changes data movement', body: 'Attention implementations in the FlashAttention family tile computation to reduce expensive memory traffic and avoid materializing the entire attention-score matrix. They preserve the attention computation up to floating-point differences rather than using a generic approximation. Eligibility depends on dtype, shape, masks, device, and backend. Confirm the selected kernel instead of assuming an API name guarantees a particular implementation. Long-context decode also needs an efficient way to read the growing KV cache.' },
      { heading: 'Speculation spends compute to save serial steps', body: 'Speculative decoding proposes several tokens with a cheaper draft mechanism and verifies them using the target model. Correct acceptance and correction rules can preserve the target sampling distribution; arbitrary acceptance rules cannot. Benefits depend on draft cost, acceptance rate, verification efficiency, and workload. A poor draft or a heavily batched service can erase the gain. Count accepted output tokens, include draft memory, and evaluate end-to-end latency rather than proposal speed.' },
      { heading: 'Change one variable and keep a fallback', body: 'First establish correctness, quality, and an unoptimized latency baseline. Introduce one technique, measure a representative traffic matrix, and keep raw results. Then test interactions: quantization can shift a workload from bandwidth limits toward compute limits; larger batches can change whether speculation helps. Report cold-start behavior, peak memory, p50/p95/p99 latency, goodput, and failure rates. Retain a verified fallback for unsupported shapes and a rollback criterion tied to user-visible outcomes.' }
    ],
    lab: {
      title: 'Compare eager dispatch with a CUDA graph',
      steps: ['Save the Python below as graph_lab.py on Linux with an NVIDIA GPU and CUDA-enabled PyTorch.', 'Run the fixed-shape pointwise example. It is a launch-overhead experiment, not an LLM benchmark.', 'Check numerical agreement, then compare elapsed wall time after warmup. Repeat with larger tensors to see the bottleneck change.', 'For an actual model, repeat the same controlled comparison with quality checks, prompt-length buckets, and realistic concurrent traffic.'],
      code: `import time
import torch

assert torch.cuda.is_available()
x = torch.randn(1024, device="cuda")
def work():
    y = x
    for _ in range(8):
        y = torch.relu(y + 0.1)
    return y

warm = torch.cuda.Stream()
warm.wait_stream(torch.cuda.current_stream())
with torch.cuda.stream(warm):
    for _ in range(10):
        work()
torch.cuda.current_stream().wait_stream(warm)
torch.cuda.synchronize()
graph = torch.cuda.CUDAGraph()
with torch.cuda.graph(graph):
    captured_output = work()
graph.replay()
torch.cuda.synchronize()
torch.testing.assert_close(captured_output, work())

def elapsed(fn, iterations=1000):
    torch.cuda.synchronize()
    start = time.perf_counter()
    for _ in range(iterations):
        fn()
    torch.cuda.synchronize()
    return (time.perf_counter() - start) * 1000 / iterations

print("Eager ms/iteration:", elapsed(work))
print("Graph ms/iteration:", elapsed(graph.replay))`,
      success: 'Verify numerical agreement and explain the measured result in terms of dispatch cost, fixed shapes, and device work. Do not extrapolate this microbenchmark into a model-level speedup.'
    },
    quiz: { question: 'Why can a 4-bit weight format fail to improve serving latency?', choices: ['Four-bit values always consume more storage than FP16', 'Dequantization, kernel support, or another bottleneck can dominate', 'Quantization removes the need for benchmarking', 'KV cache always disappears after weight quantization'], answer: 1, explanation: 'Reduced weight storage does not guarantee a faster execution path. The hardware, kernel, workload, metadata, and remaining bottlenecks determine the actual result.' },
    sources: [{ label: 'vLLM: quantization formats and hardware support', url: 'https://docs.vllm.ai/en/latest/features/quantization/' }, { label: 'vLLM: speculative decoding', url: 'https://docs.vllm.ai/en/latest/features/speculative_decoding/' }, { label: 'PyTorch: CUDA graph semantics and constraints', url: 'https://docs.pytorch.org/docs/main/notes/cuda.html#cuda-graphs' }]
  }
];
